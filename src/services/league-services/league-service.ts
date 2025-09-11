export function getRoles(sub: string | undefined) {
  if (!sub) return [];
  const roles = [];
  if (
    sub === "google-oauth2|110216442143129521066" ||
    sub === "oauth2|discord|491431053471383575"
  ) {
    roles.push("organizer");
  }
  return roles;
}
