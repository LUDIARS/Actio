// Contract for interpretTemplateLookup (C-50). Only HTTP 200 allows registration, 404 means the
// template does not exist, and any other status means Concordia could not answer.
export default {
  post: (result: string, status: number): true | string => {
    const expected = status === 200 ? "found" : status === 404 ? "missing" : "unavailable";
    return result === expected || `status ${status} must be ${expected}`;
  },
};
