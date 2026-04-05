import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";

// FIX ÍCONE
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

type Props = {
  location: {
    latitude: number;
    longitude: number;
  } | null;
  radar?: any;
  destination?: any;
};

export default function MapView({ location, radar, destination }: Props) {
  const [route, setRoute] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [trafficStatus, setTrafficStatus] = useState<string>("");

  function speak(text: string) {
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "pt-BR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(speech);
  }

  useEffect(() => {
    if (!location || !destination) return;

    async function loadRoute() {
      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${location.longitude},${location.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson&steps=true`
        );

        const data = await response.json();

        const routeData = data.routes[0];

        // rota
        const coords = routeData.geometry.coordinates.map(
          (c: any) => [c[1], c[0]]
        );
        setRoute(coords);

        // instruções
        const steps = routeData.legs[0].steps;
        const parsedInstructions = steps.map((step: any) => {
          const name = step.name || "via";
          const distance = Math.round(step.distance);
          return `Siga por ${distance} metros na ${name}`;
        });
        setInstructions(parsedInstructions);

        // 🔥 SIMULAÇÃO DE TRÂNSITO (velocidade média)
        const speed = routeData.distance / routeData.duration; // m/s

        if (speed < 5) {
          setTrafficStatus("🔴 Trânsito pesado");
          speak("Atenção, trânsito intenso à frente");
        } else if (speed < 10) {
          setTrafficStatus("🟡 Trânsito moderado");
        } else {
          setTrafficStatus("🟢 Trânsito livre");
        }

        if (parsedInstructions.length > 0) {
          speak(parsedInstructions[0]);
        }

      } catch (err) {
        console.log("Erro rota:", err);
      }
    }

    loadRoute();
  }, [location, destination]);

  if (!location) return null;

  return (
    <div>

      {/* STATUS DO TRÂNSITO */}
      {trafficStatus && (
        <div style={{
          background: "#111827",
          padding: 10,
          marginBottom: 10,
          borderRadius: 8,
          textAlign: "center",
          fontWeight: "bold"
        }}>
          {trafficStatus}
        </div>
      )}

      <MapContainer
        center={[location.latitude, location.longitude]}
        zoom={15}
        style={{ height: 350, width: "100%", borderRadius: 12 }}
      >
        <TileLayer
          attribution="© OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={[location.latitude, location.longitude]}>
          <Popup>Você</Popup>
        </Marker>

        {destination && (
          <Marker position={[destination.latitude, destination.longitude]}>
            <Popup>{destination.name}</Popup>
          </Marker>
        )}

        {radar && (
          <Marker position={[radar.latitude, radar.longitude]}>
            <Popup>🚨 Radar</Popup>
          </Marker>
        )}

        {route.length > 0 && <Polyline positions={route} />}
      </MapContainer>

      {/* INSTRUÇÃO */}
      {instructions.length > 0 && (
        <div
          style={{
            background: "#111827",
            marginTop: 10,
            padding: 12,
            borderRadius: 8,
            textAlign: "center",
            fontWeight: "bold",
          }}
        >
          {instructions[0]}
        </div>
      )}
    </div>
  );
}