import { toast } from "sonner"

export async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  } catch {
    toast.error("Could not copy. Allow clipboard access and try again.")
  }
}
