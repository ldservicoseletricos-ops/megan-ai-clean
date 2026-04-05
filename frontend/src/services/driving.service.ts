export async function sendLocationToBackend(location: any) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/driving`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(location),
  });

  return res.json();
}