// Contract for buildTaskListPage (C-21). Rows beyond limit mean another page: the page
// is cut to limit and nextCursor is set; otherwise every row is returned with null.
type Page = { tasks: unknown[]; nextCursor: string | null };

export default {
  post: (result: Page, rows: unknown[], limit: number): true | string => {
    if (rows.length > limit) {
      if (result.tasks.length !== limit) return "page must be cut to limit";
      if (typeof result.nextCursor !== "string" || result.nextCursor === "") return "nextCursor must be set when rows exceed limit";
      return true;
    }
    if (result.tasks.length !== rows.length) return "all rows must be returned on the last page";
    return result.nextCursor === null || "last page must have nextCursor null";
  },
};
