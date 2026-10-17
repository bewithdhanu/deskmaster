import assert from "node:assert"
import { createRequire } from "node:module"
import { decryptBackup } from "../src/lib/backup.ts"
import { buildNotesTree, pagePath, pageText } from "../src/lib/notes.ts"
import { totpCode } from "../src/lib/totp.ts"

const require = createRequire(import.meta.url)
const { encryptBackup } = require("../../backupCrypto.js")
const { authenticator } = require("../../node_modules/otplib")

const file = (path: string, value: unknown) => ({ path, data: Buffer.from(JSON.stringify(value)).toString("base64") })

const notes = [
  file("000002__Work__w/meta.json", { id: "w", title: "Work", type: "text", order: 2 }),
  file("000002__Work__w/content.json", { text: "" }),
  file("000002__Work__w/000001__Plan__p/meta.json", { id: "p", title: "Plan", type: "canvas", order: 1 }),
  file("000002__Work__w/000001__Plan__p/content.json", { blocks: [{ y: 90, x: 0, content: "<p>second</p>" }, { y: 10, x: 0, content: "<p>first</p>" }] }),
  file("000001__Ideas__i/meta.json", { id: "i", title: "Ideas", type: "markdown", order: 1 }),
  file("000001__Ideas__i/content.json", { blocknote: [{ type: "heading", content: [{ type: "text", text: "Ideas" }], children: [] }] }),
  file("Archived/000001__Old__o/meta.json", { id: "o", title: "Old", type: "text", order: 1 }),
  file("_clipboard/000001__Clip__c/meta.json", { id: "c", title: "Clip", type: "text", order: 1 }),
]

const payload = {
  exportDate: "2026-10-17T00:00:00.000Z",
  authenticators: [{ id: 1, name: "AWS", secret: "JBSWY3DPEHPK3PXP", password: "p@ss" }],
  clipboardHistory: [],
  notes: { version: 1, files: notes },
}

const envelope = encryptBackup(payload, "correct horse battery staple")
const opened = await decryptBackup(envelope, "correct horse battery staple")
assert.strictEqual(opened.authenticators?.[0].password, "p@ss")
await assert.rejects(() => decryptBackup(envelope, "wrong"), /Wrong passphrase/)

const tree = buildNotesTree(opened.notes?.files)
assert.deepStrictEqual(tree.pages.map((page) => page.title), ["Ideas", "Work"], "root order follows desktop order")
assert.deepStrictEqual(tree.pages[1].children.map((page) => page.title), ["Plan"], "children nest under their parent")
assert.deepStrictEqual(tree.archived.map((page) => page.title), ["Old"])
assert.ok(!tree.byId.has("c"), "internal _clipboard pages are hidden")
assert.deepStrictEqual(pagePath(tree, "p").map((page) => page.title), ["Work", "Plan"])
assert.match(pageText(tree.byId.get("p")!), /first[\s\S]*second/)
assert.strictEqual(pageText(tree.byId.get("i")!), "Ideas")

authenticator.options = { window: 0 }
assert.strictEqual(await totpCode("JBSWY3DPEHPK3PXP"), authenticator.generate("JBSWY3DPEHPK3PXP"), "TOTP matches desktop otplib")

console.log("deskmaster-web: decrypt, notes tree and TOTP checks passed")
