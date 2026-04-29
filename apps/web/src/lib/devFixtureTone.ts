/** Loads the short WAV from `public/` and returns base64 for dev inject-translated-audio. */
export async function loadDevFixtureToneBase64(): Promise<string> {
  const res = await fetch("/dev-fixture-tone.wav");
  if (!res.ok) throw new Error("Fixture WAV not found");
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
