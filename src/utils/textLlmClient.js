import { getIpcRenderer } from './electron';

const SETTINGS_HINT = 'Configure an LLM provider in Settings → AI Agent.';

function normalizeError(error) {
  const message = error?.message || 'AI request failed';
  if (/No LLM provider|provider configured/i.test(message)) {
    return new Error(`${message} ${SETTINGS_HINT}`);
  }
  return error instanceof Error ? error : new Error(message);
}

export async function aiEditText(text, action, extra = {}) {
  try {
    return await getIpcRenderer().invoke('ai-edit-text', text, action, extra);
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function reformatText(text, tones) {
  try {
    return await getIpcRenderer().invoke('reformat-text', text, tones);
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function translateText(text, targetLanguage) {
  try {
    return await getIpcRenderer().invoke('translate-text', text, targetLanguage);
  } catch (error) {
    throw normalizeError(error);
  }
}
