import { useParams } from "react-router-dom";

/**
 * Returns a required route parameter or throws a 404 Response
 * (caught by React Router's error boundary).
 */
export function useRequiredParam(name: string): string {
  const params = useParams();
  const value = params[name];

  if (!value) {
    throw new Response("Not Found", { status: 404 });
  }

  return value;
}
