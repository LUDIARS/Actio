export default {
  post(result: boolean, clientId: string | undefined, boundClientId: string): true | string {
    return result === (typeof clientId === "string" && clientId.length > 0 && clientId === boundClientId)
      || "The control principal must be the bound API client";
  },
};
