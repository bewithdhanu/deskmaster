// deskmaster-tray - native macOS menu bar item for DeskMaster.
//
// Electron sends newline-delimited JSON on stdin; this process draws the status item
// natively (no web view, no screenshots) and ticks the clocks itself, once per second.
//
//   stdin  -> {"type":"state","timeFormat":"HH:mm:ss","cells":[{label,value|segments|tz|ring|up+down,calendar?,reserve?}]}
//                       "converter":{"clocks":[{tz,label}],"twelveHour":true,"theme":"system|light|dark"}}
//             {"type":"quit"}
//   stdout <- {"type":"ready"} | {"type":"right-click","x","y","width","height"} | {"type":"open-app"}
//
// Left click opens a native time-converter popover anchored to the item.
//
// Exits when stdin closes (i.e. when DeskMaster quits or crashes).
// Test mode: deskmaster-tray --render out.png [--light] < state.json

import AppKit
import CoreText
import SwiftUI

// MARK: - Protocol

struct Segment: Decodable { let text: String; let color: String?; let symbol: String? } // symbol: SF Symbol drawn before the text
struct Ring: Decodable { let value: Double; let color: String } // 0-100 gauge

struct Cell: Decodable {
    let label: String
    let value: String?
    let segments: [Segment]?
    let tz: String?
    let timeFormat: String? // overrides the message format for this clock only
    let reserve: String? // widest expected value; the cell never gets narrower than this
    let calendar: Bool? // draw today's date in `tz` as a calendar-page icon; clocks get +1/−1 against this zone
    let ring: Ring? // gauge with the value inside and the label under it
    let up: String? // with `down`: two stacked rows, ▲ upload over ▼ download
    let down: String?
}

struct Message: Decodable {
    let type: String
    let cells: [Cell]?
    let timeFormat: String?
    let converter: ConverterConfig?
}

struct Clock: Decodable, Equatable { let tz: String; let label: String? }
struct ConverterConfig: Decodable, Equatable { let clocks: [Clock]; let twelveHour: Bool; let theme: String? }

/// Days since 1970 of the calendar date `date` falls on in `zone`, so zones can be compared by day.
func dayNumber(_ date: Date, _ zone: TimeZone) -> Int {
    var gregorian = Calendar(identifier: .gregorian)
    gregorian.timeZone = zone
    var c = gregorian.dateComponents([.year, .month, .day], from: date)
    c.timeZone = TimeZone(identifier: "UTC")
    guard let midnight = gregorian.date(from: c) else { return 0 }
    return Int((midnight.timeIntervalSince1970 / 86400).rounded())
}

func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
          let line = String(data: data, encoding: .utf8) else { return }
    FileHandle.standardOutput.write((line + "\n").data(using: .utf8)!)
}

// MARK: - Time formatting (subset of moment.js tokens used by DeskMaster's settings)

func dateFormatPattern(fromMoment format: String) -> String {
    let tokens: [(String, String)] = [("MMM", "MMM"), ("HH", "HH"), ("mm", "mm"), ("ss", "ss"), ("DD", "dd"), ("A", "a"), ("h", "h")]
    var out = ""
    var i = format.startIndex
    while i < format.endIndex {
        if let (src, dst) = tokens.first(where: { format[i...].hasPrefix($0.0) }) {
            out += dst
            i = format.index(i, offsetBy: src.count)
        } else {
            let c = format[i]
            if c == "'" { out += "''" } else if c.isLetter { out += "'\(c)'" } else { out.append(c) }
            i = format.index(after: i)
        }
    }
    return out
}

func color(fromHex hex: String?) -> NSColor? {
    guard var h = hex?.trimmingCharacters(in: .whitespaces), !h.isEmpty else { return nil }
    if h.hasPrefix("#") { h.removeFirst() }
    guard h.count == 6, let n = UInt32(h, radix: 16) else { return nil }
    return NSColor(
        srgbRed: CGFloat((n >> 16) & 0xff) / 255,
        green: CGFloat((n >> 8) & 0xff) / 255,
        blue: CGFloat(n & 0xff) / 255,
        alpha: 1
    )
}

// MARK: - View

/// A CoreText line built once and re-used by every draw (drawing must stay cheap:
/// macOS calls draw twice per update - once for the bar and once for its menu-bar snapshot).
struct TextLine {
    let line: CTLine
    let width: CGFloat
    let ascent: CGFloat
    let descent: CGFloat
    var height: CGFloat { ascent + descent }
}

/// Runs without a colour use the context's fill colour, so the text follows the
/// menu bar's light/dark appearance at draw time.
func makeLine(_ runs: [(text: String, color: NSColor?)], font: NSFont) -> TextLine {
    let attributed = NSMutableAttributedString()
    for run in runs {
        var attrs: [NSAttributedString.Key: Any] = [NSAttributedString.Key(kCTFontAttributeName as String): font]
        if let c = run.color {
            attrs[NSAttributedString.Key(kCTForegroundColorAttributeName as String)] = c.cgColor
        } else {
            attrs[NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String)] = true
        }
        attributed.append(NSAttributedString(string: run.text, attributes: attrs))
    }
    let line = CTLineCreateWithAttributedString(attributed)
    var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
    let width = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, &leading))
    return TextLine(line: line, width: width, ascent: ascent, descent: descent)
}

final class TrayView: NSView {
    private(set) var cells: [Cell] = []
    private var timeFormat = "HH:mm:ss"
    private var formatters: [String: DateFormatter] = [:]
    private var labelLines: [TextLine] = []
    private var valueLines: [TextLine] = []
    private var valueTexts: [String] = []
    private var reserveWidths: [CGFloat] = []
    private var shiftLines: [TextLine?] = []
    private var splitLines: [(up: TextLine, down: TextLine)?] = []
    private var stackedLabels: [[TextLine]] = [] // ring labels, one upright character per row
    private var pieces: [[(symbol: NSImage?, text: TextLine)]] = []
    private var cellWidths: [CGFloat] = []
    private var refZone: TimeZone = .current
    var previewBackground: NSColor?

    // Same proportions as the previous web-rendered tray (7px / 8px text in a 17px bar, shown at 22pt).
    private let labelFont = NSFont.systemFont(ofSize: 9, weight: .semibold)
    private let valueFont = NSFont.monospacedDigitSystemFont(ofSize: 10.4, weight: .bold)
    private let gap: CGFloat = 8 // the only spacing between cells
    private let pad: CGFloat = 5
    private let rowOverlap: CGFloat = 2
    private let shiftFont = NSFont.systemFont(ofSize: 6.5, weight: .bold)
    private let calMonthFont = NSFont.systemFont(ofSize: 6.8, weight: .heavy)
    private let calDayFont = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .bold)
    private let calSize = CGSize(width: 20, height: 20)
    private let calHeader: CGFloat = 8
    private let ringSize: CGFloat = 19
    private let ringStroke: CGFloat = 2.4
    private let ringLabelFont = NSFont.systemFont(ofSize: 5.6, weight: .heavy)
    private let ringLabelRow: CGFloat = 5.2
    private let ringValueFont = NSFont.monospacedDigitSystemFont(ofSize: 8, weight: .heavy)
    private let splitFont = NSFont.monospacedDigitSystemFont(ofSize: 8.4, weight: .bold)
    private let splitRow: CGFloat = 9.5
    private let pieceGap: CGFloat = 5 // between icon+count pairs
    private let bigValueFont = NSFont.monospacedDigitSystemFont(ofSize: 11.5, weight: .bold) // unlabelled segment cells
    private lazy var upArrow = makeLine([("▲", nil)], font: NSFont.systemFont(ofSize: 5.5, weight: .bold))
    private lazy var downArrow = makeLine([("▼", nil)], font: NSFont.systemFont(ofSize: 5.5, weight: .bold))

    var hasClocks: Bool { cells.contains { $0.tz != nil } }
    var showsSeconds: Bool {
        if timeFormat.contains("ss") { return true }
        return cells.contains { ($0.timeFormat ?? "").contains("ss") }
    }

    override var isFlipped: Bool { false }
    override func hitTest(_ point: NSPoint) -> NSView? { nil } // clicks go to the status button

    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        needsDisplay = true
    }

    func update(cells: [Cell], timeFormat: String) {
        if timeFormat != self.timeFormat {
            formatters.removeAll()
            self.timeFormat = timeFormat
        }
        self.cells = cells
        labelLines = cells.map { makeLine([($0.label, nil)], font: labelFont) }
        reserveWidths = cells.map { c in c.reserve.map { makeLine([($0, nil)], font: c.up != nil ? splitFont : valueFont).width } ?? 0 }
        valueTexts = cells.map { _ in "" }
        valueLines = cells.indices.map { _ in makeLine([("", nil)], font: valueFont) }
        shiftLines = cells.map { _ in nil }
        splitLines = cells.map { _ in nil }
        stackedLabels = cells.map { _ in [] }
        pieces = cells.map { _ in [] }
        refZone = cells.first { $0.calendar == true }?.tz.flatMap { TimeZone(identifier: $0) } ?? .current
        for i in cells.indices { rebuildValue(i) }
        recomputeWidths()
        needsDisplay = true
    }

    /// Called once per tick: only clock cells whose text changed are re-laid-out.
    func refreshClocks() {
        var changed = false
        for (i, cell) in cells.enumerated() where cell.tz != nil {
            if rebuildValue(i) { changed = true }
        }
        if changed {
            recomputeWidths()
            needsDisplay = true
        }
    }

    @discardableResult
    private func rebuildValue(_ i: Int) -> Bool {
        let cell = cells[i]
        let now = Date()
        if cell.calendar == true {
            let zone = cell.tz.flatMap { TimeZone(identifier: $0) } ?? .current
            let month = formatter(zone, "MMM").string(from: now).uppercased(), day = formatter(zone, "d").string(from: now)
            if month + day == valueTexts[i] { return false }
            valueTexts[i] = month + day
            labelLines[i] = makeLine([(month, .white)], font: calMonthFont)
            valueLines[i] = makeLine([(day, nil)], font: calDayFont)
            return true
        }
        if let ring = cell.ring {
            stackedLabels[i] = cell.label.map { makeLine([(String($0), nil)], font: ringLabelFont) }
            valueLines[i] = makeLine([("\(Int(ring.value.rounded()))", nil)], font: ringValueFont)
            return true
        }
        if cell.up != nil || cell.down != nil {
            splitLines[i] = (makeLine([(cell.up ?? "0 B", nil)], font: splitFont), makeLine([(cell.down ?? "0 B", nil)], font: splitFont))
            return true
        }
        let text = cell.tz != nil ? clockText(for: cell) : (cell.value ?? "")
        let shift = cell.tz.flatMap { TimeZone(identifier: $0) }.map { dayNumber(now, $0) - dayNumber(now, refZone) } ?? 0
        let shiftText = shift == 0 ? "" : shift > 0 ? "+\(shift)" : "−\(-shift)"
        let key = text + "\u{1}" + shiftText
        if cell.segments == nil && key == valueTexts[i] { return false }
        valueTexts[i] = key
        shiftLines[i] = shiftText.isEmpty ? nil : makeLine([(shiftText, nil)], font: shiftFont)
        if let segments = cell.segments {
            let font = cell.label.isEmpty ? bigValueFont : valueFont
            valueLines[i] = makeLine([(segments.map(\.text).joined(), nil)], font: font)
            pieces[i] = segments.map { seg in
                let tint = color(fromHex: seg.color)
                return (seg.symbol.flatMap { symbolImage($0, tint, size: font.pointSize * 0.75) }, makeLine([(seg.text, tint)], font: font))
            }
        } else {
            valueLines[i] = makeLine([(text, nil)], font: valueFont)
        }
        return true
    }

    private func clockText(for cell: Cell) -> String {
        let zone = cell.tz.flatMap { TimeZone(identifier: $0) } ?? .current
        return formatter(zone, dateFormatPattern(fromMoment: cell.timeFormat ?? timeFormat)).string(from: Date())
    }

    private func formatter(_ zone: TimeZone, _ pattern: String) -> DateFormatter {
        let key = zone.identifier + "\n" + pattern
        if let cached = formatters[key] { return cached }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = zone
        f.dateFormat = pattern
        formatters[key] = f
        return f
    }

    private func valueWidth(_ i: Int) -> CGFloat {
        if !pieces[i].isEmpty {
            return pieces[i].reduce(0) { $0 + ($1.symbol.map { $0.size.width + 1 } ?? 0) + $1.text.width } + pieceGap * CGFloat(pieces[i].count - 1)
        }
        return valueLines[i].width + (shiftLines[i].map { 1 + $0.width } ?? 0)
    }

    private func symbolImage(_ name: String, _ tint: NSColor?, size: CGFloat) -> NSImage? {
        let config = NSImage.SymbolConfiguration(pointSize: size, weight: .bold)
            .applying(NSImage.SymbolConfiguration(paletteColors: [tint ?? .labelColor]))
        return NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(config)
    }

    private func recomputeWidths() {
        // Cells fit their content; a cell with `reserve` keeps a fixed width so changing values don't shift the bar.
        cellWidths = cells.indices.map { i in
            if cells[i].calendar == true { return calSize.width }
            if cells[i].ring != nil { return ((stackedLabels[i].map(\.width).max() ?? 0) + 1.5 + ringSize).rounded(.up) }
            if let split = splitLines[i] { return (upArrow.width + 1.5 + max(split.up.width, split.down.width, reserveWidths[i])).rounded(.up) }
            return max(labelLines[i].width, valueWidth(i), reserveWidths[i]).rounded(.up)
        }
    }

    private func drawRing(_ i: Int, at x: CGFloat, in ctx: CGContext) {
        guard let ring = cells[i].ring else { return }
        let number = valueLines[i]
        let center = CGPoint(x: x + cellWidths[i] - ringSize / 2, y: bounds.height / 2)
        let radius = (ringSize - ringStroke) / 2
        ctx.setLineWidth(ringStroke)
        ctx.setStrokeColor(NSColor.labelColor.withAlphaComponent(0.16).cgColor)
        ctx.addArc(center: center, radius: radius, startAngle: 0, endAngle: .pi * 2, clockwise: false)
        ctx.strokePath()
        let fraction = CGFloat(min(max(ring.value, 0), 100) / 100)
        if fraction > 0 {
            ctx.setLineCap(.round)
            ctx.setStrokeColor((color(fromHex: ring.color) ?? .systemGreen).cgColor)
            ctx.addArc(center: center, radius: radius, startAngle: .pi / 2, endAngle: .pi / 2 - .pi * 2 * fraction, clockwise: true)
            ctx.strokePath()
        }
        ctx.textPosition = CGPoint(x: center.x - number.width / 2, y: center.y - (number.ascent - number.descent) / 2)
        CTLineDraw(number.line, ctx)
        let chars = stackedLabels[i]
        let column = chars.map(\.width).max() ?? 0
        let top = center.y + ringLabelRow * CGFloat(chars.count) / 2
        ctx.setFillColor(NSColor.labelColor.withAlphaComponent(0.72).cgColor)
        for (row, char) in chars.enumerated() {
            let mid = top - ringLabelRow * (CGFloat(row) + 0.5)
            ctx.textPosition = CGPoint(x: x + (column - char.width) / 2, y: mid - ringLabelFont.capHeight / 2)
            CTLineDraw(char.line, ctx)
        }
    }

    private func drawSplit(_ i: Int, at x: CGFloat, in ctx: CGContext) {
        guard let split = splitLines[i] else { return }
        let top = (bounds.height + splitRow * 2) / 2
        for (row, (arrow, line)) in [(upArrow, split.up), (downArrow, split.down)].enumerated() {
            let mid = top - splitRow * (CGFloat(row) + 0.5)
            ctx.saveGState()
            ctx.setFillColor(NSColor.labelColor.withAlphaComponent(0.65).cgColor)
            ctx.textPosition = CGPoint(x: x, y: mid - (arrow.ascent - arrow.descent) / 2)
            CTLineDraw(arrow.line, ctx)
            ctx.restoreGState()
            ctx.textPosition = CGPoint(x: x + upArrow.width + 1.5, y: mid - (line.ascent - line.descent) / 2)
            CTLineDraw(line.line, ctx)
        }
    }

    private func drawCalendar(_ i: Int, at x: CGFloat, in ctx: CGContext) {
        let rect = CGRect(x: x, y: ((bounds.height - calSize.height) / 2).rounded(), width: calSize.width, height: calSize.height)
        let page = CGPath(roundedRect: rect.insetBy(dx: 0.4, dy: 0.4), cornerWidth: 3, cornerHeight: 3, transform: nil)
        ctx.saveGState()
        ctx.addPath(page)
        ctx.clip()
        ctx.setFillColor(NSColor.systemRed.cgColor)
        ctx.fill(CGRect(x: rect.minX, y: rect.maxY - calHeader, width: rect.width, height: calHeader))
        ctx.restoreGState()
        ctx.addPath(page)
        ctx.setStrokeColor(NSColor.labelColor.withAlphaComponent(0.85).cgColor)
        ctx.setLineWidth(0.8)
        ctx.strokePath()

        let month = labelLines[i], day = valueLines[i]
        let headerMid = rect.maxY - calHeader / 2, bodyMid = rect.minY + (rect.height - calHeader) / 2
        ctx.textPosition = CGPoint(x: rect.midX - day.width / 2, y: bodyMid - (day.ascent - day.descent) / 2)
        CTLineDraw(day.line, ctx)
        ctx.saveGState() // CoreText leaves the month's white fill on the context
        ctx.textPosition = CGPoint(x: rect.midX - month.width / 2, y: headerMid - (month.ascent - month.descent) / 2)
        CTLineDraw(month.line, ctx)
        ctx.restoreGState()
    }

    func desiredWidth() -> CGFloat {
        pad * 2 + cellWidths.reduce(0, +) + gap * CGFloat(max(cellWidths.count - 1, 0))
    }

    override func draw(_ dirtyRect: NSRect) {
        effectiveAppearance.performAsCurrentDrawingAppearance {
            if let bg = previewBackground {
                bg.setFill()
                bounds.fill()
            }
            guard let ctx = NSGraphicsContext.current?.cgContext else { return }
            ctx.setFillColor(NSColor.labelColor.cgColor)
            ctx.textMatrix = .identity

            var x = pad
            for i in cells.indices {
                ctx.saveGState() // coloured runs leave their fill on the context
                defer { ctx.restoreGState() }
                if cells[i].calendar == true || cells[i].ring != nil || splitLines[i] != nil {
                    if cells[i].calendar == true { drawCalendar(i, at: x, in: ctx) }
                    else if cells[i].ring != nil { drawRing(i, at: x, in: ctx) }
                    else { drawSplit(i, at: x, in: ctx) }
                    x += cellWidths[i] + gap
                    continue
                }
                let label = labelLines[i], value = valueLines[i]
                let labelled = !cells[i].label.isEmpty
                let block = labelled ? label.height + value.height - rowOverlap : value.height
                let top = (bounds.height + block) / 2

                ctx.textPosition = CGPoint(x: x + (cellWidths[i] - label.width) / 2, y: top - label.ascent)
                CTLineDraw(label.line, ctx)

                let valueTop = labelled ? top - label.height + rowOverlap : top
                let valueX = x + (cellWidths[i] - valueWidth(i)) / 2
                let baseline = labelled ? valueTop - value.ascent : ((bounds.height - bigValueFont.capHeight) / 2).rounded()
                if pieces[i].isEmpty {
                    ctx.textPosition = CGPoint(x: valueX, y: baseline)
                    CTLineDraw(value.line, ctx)
                } else {
                    var px = valueX
                    for piece in pieces[i] {
                        if let symbol = piece.symbol {
                            let h = symbol.size.height
                            let capHeight = labelled ? valueFont.capHeight : bigValueFont.capHeight
                            symbol.draw(in: NSRect(x: px, y: baseline + (capHeight - h) / 2, width: symbol.size.width, height: h))
                            px += symbol.size.width + 1
                        }
                        ctx.textPosition = CGPoint(x: px, y: baseline)
                        CTLineDraw(piece.text.line, ctx)
                        px += piece.text.width + pieceGap
                    }
                }
                if let shift = shiftLines[i] {
                    ctx.textPosition = CGPoint(x: valueX + value.width + 1, y: valueTop - shift.ascent)
                    CTLineDraw(shift.line, ctx)
                }

                x += cellWidths[i] + gap
            }
        }
    }
}

// MARK: - Time converter popover

final class ConverterModel: ObservableObject {
    @Published var clocks: [Clock] = []
    @Published var twelveHour = true
    @Published var date = Date() // the instant; the pickers show it in `from`
    @Published var from: String { didSet { fromChanged(oldValue) } }
    // The known list can lack aliases the system reports (e.g. Asia/Kolkata vs Asia/Calcutta)
    private let allZones = Set(TimeZone.knownTimeZoneIdentifiers + ["UTC", TimeZone.current.identifier]).sorted()

    init() {
        from = UserDefaults.standard.string(forKey: "converterFrom") ?? TimeZone.current.identifier
    }

    func apply(_ config: ConverterConfig) {
        let valid = config.clocks.filter { TimeZone(identifier: $0.tz) != nil }
        if clocks != valid { clocks = valid }
        if twelveHour != config.twelveHour { twelveHour = config.twelveHour }
    }

    var clockZones: [String] { clocks.map(\.tz) }
    var otherZones: [String] { allZones.filter { !clockZones.contains($0) } }

    /// Picking a new source zone keeps the typed wall-clock time.
    private func fromChanged(_ old: String) {
        UserDefaults.standard.set(from, forKey: "converterFrom")
        guard old != from, let a = TimeZone(identifier: old), let b = TimeZone(identifier: from) else { return }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = a
        let wall = cal.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        cal.timeZone = b
        if let d = cal.date(from: wall) { date = d }
    }

    func label(_ id: String) -> String {
        let custom = clocks.first { $0.tz == id }?.label.flatMap { $0.isEmpty ? nil : "\($0) — " } ?? ""
        return "\(custom)\(city(id)) (UTC\(offset(TimeZone(identifier: id)?.secondsFromGMT(for: date) ?? 0)))"
    }

    func city(_ id: String) -> String { id.split(separator: "/").last.map(String.init)?.replacingOccurrences(of: "_", with: " ") ?? id }

    private func offset(_ secs: Int) -> String {
        String(format: "%@%02d:%02d", secs < 0 ? "−" : "+", abs(secs) / 3600, abs(secs) % 3600 / 60)
    }

    func converted(_ id: String) -> (time: String, day: String, shift: Int, meta: String) {
        let src = TimeZone(identifier: from) ?? .current, dst = TimeZone(identifier: id) ?? .current
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = dst
        f.dateFormat = twelveHour ? "h:mm a" : "HH:mm"
        let time = f.string(from: date)
        f.dateFormat = "EEE, d MMM"
        let minutes = (dst.secondsFromGMT(for: date) - src.secondsFromGMT(for: date)) / 60, m = abs(minutes)
        let ahead = minutes == 0 ? "Same time" : "\(m / 60)h\(m % 60 > 0 ? " \(m % 60)m" : "") \(minutes > 0 ? "ahead" : "behind")"
        return (time, f.string(from: date), dayNumber(date, dst) - dayNumber(date, src), "\(ahead) · \(dst.abbreviation(for: date) ?? "")")
    }
}

struct ConverterView: View {
    @ObservedObject var model: ConverterModel
    let openApp: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Time converter").font(.headline)
                Spacer()
                Button("Open DeskMaster", action: openApp).buttonStyle(.link)
            }
            GroupBox {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        caption("From")
                        Spacer()
                        Button("Now") { model.date = Date() }.buttonStyle(.link)
                    }
                    HStack {
                        DatePicker("Date", selection: $model.date, displayedComponents: .date)
                        DatePicker("Time", selection: $model.date, displayedComponents: .hourAndMinute)
                    }
                    .labelsHidden()
                    .datePickerStyle(.field)
                    .environment(\.timeZone, TimeZone(identifier: model.from) ?? .current)
                    .environment(\.locale, Locale(identifier: model.twelveHour ? "en_US" : "en_GB"))
                    Picker("Time zone", selection: $model.from) {
                        Section("Your clocks") { ForEach(model.clockZones, id: \.self) { Text(model.label($0)).tag($0) } }
                        Section("All time zones") { ForEach(model.otherZones, id: \.self) { Text(model.label($0)).tag($0) } }
                    }
                    .labelsHidden()
                }
                .padding(4)
            }
            GroupBox {
                VStack(spacing: 0) {
                    if model.clocks.isEmpty {
                        Text("Add clocks in DeskMaster to see them here").font(.callout).foregroundColor(.secondary).padding(8)
                    }
                    ForEach(Array(model.clocks.enumerated()), id: \.offset) { index, clock in
                        if index > 0 { Divider() }
                        clockRow(clock)
                    }
                }
                .padding(.horizontal, 4)
            }
        }
        .padding(14)
        .frame(width: 330)
    }

    private func clockRow(_ clock: Clock) -> some View {
        let r = model.converted(clock.tz)
        return HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(clock.label.flatMap { $0.isEmpty ? nil : $0 } ?? model.city(clock.tz)).font(.body.weight(.semibold))
                Text(r.meta).font(.caption).foregroundColor(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(r.time).font(.system(size: 20, weight: .bold).monospacedDigit())
                HStack(spacing: 4) {
                    if r.shift != 0 {
                        Text("\(r.shift > 0 ? "+" : "−")\(abs(r.shift))d")
                            .font(.caption2.weight(.bold))
                            .padding(.horizontal, 4).padding(.vertical, 1)
                            .background(Color.accentColor.opacity(0.18), in: RoundedRectangle(cornerRadius: 4))
                            .foregroundColor(.accentColor)
                    }
                    Text(r.day).font(.caption).foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 7)
    }

    private func caption(_ text: String) -> some View {
        Text(text.uppercased()).font(.caption2.weight(.bold)).foregroundColor(.secondary)
    }
}

// MARK: - Controller

final class Controller: NSObject, NSPopoverDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let view = TrayView(frame: .zero)
    private var timer: Timer?
    private let converter = ConverterModel()
    private var popoverClosedAt = Date.distantPast
    private lazy var popover: NSPopover = {
        let popover = NSPopover()
        popover.behavior = .transient
        let host = NSHostingController(rootView: ConverterView(model: converter) { [weak self] in
            self?.popover.performClose(nil)
            emit(["type": "open-app"])
        })
        popover.contentViewController = host
        popover.contentSize = host.view.fittingSize
        popover.delegate = self
        return popover
    }()

    func start() {
        if let button = statusItem.button {
            view.frame = button.bounds
            view.autoresizingMask = [.width, .height]
            button.addSubview(view)
            button.target = self
            button.action = #selector(clicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
            button.toolTip = "DeskMaster"
        }

        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(self, selector: #selector(sleep), name: NSWorkspace.screensDidSleepNotification, object: nil)
        ws.addObserver(self, selector: #selector(sleep), name: NSWorkspace.willSleepNotification, object: nil)
        ws.addObserver(self, selector: #selector(wake), name: NSWorkspace.screensDidWakeNotification, object: nil)
        ws.addObserver(self, selector: #selector(wake), name: NSWorkspace.didWakeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(wake), name: .NSSystemClockDidChange, object: nil)

        emit(["type": "ready"])
    }

    func handle(_ message: Message) {
        switch message.type {
        case "state":
            view.update(cells: message.cells ?? [], timeFormat: message.timeFormat ?? "HH:mm:ss")
            relayout()
            restartTimer()
            if let config = message.converter {
                converter.apply(config)
                let appearance = config.theme == "dark" ? NSAppearance(named: .darkAqua) : config.theme == "light" ? NSAppearance(named: .aqua) : nil
                if popover.appearance?.name != appearance?.name { popover.appearance = appearance }
            }
        case "quit":
            NSApp.terminate(nil)
        default:
            break
        }
    }

    private func relayout() {
        let w = view.desiredWidth()
        if abs(statusItem.length - w) > 0.5 { statusItem.length = w }
        view.needsDisplay = true
    }

    // Tick on the exact second (or minute) boundary. Stopped while the display sleeps.
    private func restartTimer() {
        timer?.invalidate()
        timer = nil
        guard view.hasClocks else { return }
        let interval: TimeInterval = view.showsSeconds ? 1 : 60
        let next = (floor(Date().timeIntervalSince1970 / interval) + 1) * interval
        let t = Timer(fire: Date(timeIntervalSince1970: next), interval: interval, repeats: true) { [weak self] _ in
            self?.tick()
        }
        t.tolerance = 0.02
        RunLoop.main.add(t, forMode: .common) // keep ticking while a menu is open
        timer = t
    }

    private func tick() {
        view.refreshClocks()
        relayout()
    }

    @objc private func sleep() {
        timer?.invalidate()
        timer = nil
    }

    @objc private func wake() {
        tick()
        restartTimer()
    }

    @objc private func clicked(_ sender: NSStatusBarButton) {
        guard let event = NSApp.currentEvent, let window = sender.window else { return }
        let isRight = event.type == .rightMouseUp || event.modifierFlags.contains(.control)
        if !isRight {
            if popover.isShown {
                popover.performClose(nil)
            } else if Date().timeIntervalSince(popoverClosedAt) > 0.3 { // this click already closed it (transient)
                converter.date = Date()
                if let content = popover.contentViewController?.view { popover.contentSize = content.fittingSize } // clock count may have changed
                NSApp.activate(ignoringOtherApps: true)
                popover.show(relativeTo: sender.bounds, of: sender, preferredEdge: .minY)
            }
            return
        }
        popover.performClose(nil)
        let f = window.frame
        let screenHeight = NSScreen.screens.first?.frame.height ?? 0
        emit(["type": "right-click", "x": f.minX, "y": screenHeight - f.maxY, "width": f.width, "height": f.height])
    }

    func popoverDidClose(_ notification: Notification) {
        popoverClosedAt = Date()
    }
}

// MARK: - Entry points

func renderPreview(to path: String, light: Bool) {
    guard let data = try? FileHandle.standardInput.readToEnd(),
          let message = try? JSONDecoder().decode(Message.self, from: data) else {
        FileHandle.standardError.write("invalid state JSON on stdin\n".data(using: .utf8)!)
        exit(2)
    }
    let view = TrayView(frame: .zero)
    view.update(cells: message.cells ?? [], timeFormat: message.timeFormat ?? "HH:mm:ss")
    let width = view.desiredWidth(), height: CGFloat = 24, scale = 3
    view.frame = NSRect(x: 0, y: 0, width: width, height: height)
    view.appearance = NSAppearance(named: light ? .aqua : .darkAqua)
    view.previewBackground = NSColor(white: light ? 0.92 : 0.12, alpha: 1)

    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(width) * scale, pixelsHigh: Int(height) * scale,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
        let ctx = NSGraphicsContext(bitmapImageRep: rep),
        let png = {
            rep.size = NSSize(width: width, height: height)
            ctx.cgContext.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
            view.displayIgnoringOpacity(view.bounds, in: ctx)
            return rep.representation(using: .png, properties: [:])
        }()
    else { exit(2) }
    try? png.write(to: URL(fileURLWithPath: path))
    print("width=\(width)")
}

let args = CommandLine.arguments
_ = NSApplication.shared

if let i = args.firstIndex(of: "--render"), i + 1 < args.count {
    renderPreview(to: args[i + 1], light: args.contains("--light"))
    exit(0)
}

NSApp.setActivationPolicy(.accessory)
let controller = Controller()
controller.start()

DispatchQueue.global(qos: .utility).async {
    let decoder = JSONDecoder()
    while let line = readLine(strippingNewline: true) {
        guard let data = line.data(using: .utf8), let message = try? decoder.decode(Message.self, from: data) else { continue }
        DispatchQueue.main.async { controller.handle(message) }
    }
    DispatchQueue.main.async { NSApp.terminate(nil) } // stdin closed: parent is gone
}

NSApp.run()
