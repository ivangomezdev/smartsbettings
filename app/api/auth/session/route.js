import { json, handleApiError } from "../../../../lib/api.js";
import { getSessionUser } from "../../../../lib/auth.js";

export async function GET(request) {
  try {
    const user = await getSessionUser(request);

    if (!user) {
      return json({ user: null }, 401);
    }

    return json({ user });
  } catch (error) {
    return handleApiError(error);
  }
}
