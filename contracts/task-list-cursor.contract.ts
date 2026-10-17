// Contract for decodeTaskListCursor (C-19). A decoded key always belongs to the
// requested sort and carries exactly what encodeTaskListCursor put in the payload.
type Key = { sort: string; id: string } & Record<string, unknown>;

export default {
  post: (result: Key | null, raw: string, sort: string): true | string => {
    if (result === null) return true;
    if (result.sort !== sort) return "cursor of another sort must not decode";
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>;
    } catch {
      return "undecodable cursor must yield null";
    }
    for (const [field, value] of Object.entries(result)) {
      if (payload[field] !== value) return `decoded ${field} must match the payload`;
    }
    return true;
  },
};
