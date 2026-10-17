import { cn } from "cn"

import { Button } from "@/components/ui/button"

const REPO_URL = "https://github.com/bewithdhanu/deskmaster"

export function Logo({ className }: { className?: string }) {
  return <img src="/icon-256.png" alt="" className={cn("shrink-0 rounded-full", className)} />
}

function GitHubMark(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  )
}

export function Credits({ className }: { className?: string }) {
  return (
    <footer className={cn("flex flex-wrap items-center justify-center gap-x-1 text-xs text-muted-foreground", className)}>
      <span>Built by</span>
      <Button variant="link" size="xs" asChild className="px-0">
        <a href="mailto:bewithdhanu@gmail.com">Dhanu K</a>
      </Button>
      <span aria-hidden>·</span>
      <Button variant="link" size="xs" asChild className="px-0">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <GitHubMark data-icon="inline-start" />
          bewithdhanu/deskmaster
        </a>
      </Button>
    </footer>
  )
}
