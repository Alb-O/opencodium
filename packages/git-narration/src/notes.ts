/**
 * Note store for passing metadata from tool execution to the after hook.
 * 
 * The wrapped tools store their results here keyed by callID, then the
 * tool.execute.after hook retrieves and applies them to the result object.
 */

export type Note = {
  title: string;
  output: string;
  metadata: {
    filePath: string;
    diff: string;
  };
};

const store = new Map<string, Note>();

export function setNote(callID: string, note: Note): void {
  store.set(callID, note);
}

export function takeNote(callID: string): Note | undefined {
  const note = store.get(callID);
  if (note) {
    store.delete(callID);
  }
  return note;
}
