function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export const favoriteDestinations = [
  {
    id: "home",
    label: "Casa",
    address: "Praça da Moça, Centro, Diadema - SP",
  },
  {
    id: "work",
    label: "Trabalho",
    address: "Rua Presidente Wenceslau, Eldorado, Diadema - SP, Brasil",
  },
];

export const recentDestinations = [];

let activeNavigationContext = {
  active: false,
  destination: null,
  startedAt: null,
};

export function addRecentDestination(destination) {
  if (!destination?.name) return;

  const normalized = normalizeText(destination.name);
  const filtered = recentDestinations.filter(
    (item) => normalizeText(item.name) !== normalized
  );

  filtered.unshift({
    name: destination.name,
    latitude: destination.latitude,
    longitude: destination.longitude,
  });

  recentDestinations.length = 0;
  recentDestinations.push(...filtered.slice(0, 6));
}

export function setActiveNavigation(destination) {
  activeNavigationContext = {
    active: true,
    destination,
    startedAt: new Date().toISOString(),
  };
}

export function clearActiveNavigation() {
  activeNavigationContext = {
    active: false,
    destination: null,
    startedAt: null,
  };
}

export function hasActiveNavigation() {
  return Boolean(
    activeNavigationContext.active && activeNavigationContext.destination
  );
}

export function getActiveNavigation() {
  return activeNavigationContext;
}

export function findFavoriteDestinationByMessage(message) {
  const text = normalizeText(message);

  if (
    text === "casa" ||
    text === "me leva para casa" ||
    text === "me leva pra casa" ||
    text === "ir para casa" ||
    text === "ir pra casa" ||
    text === "navegar para casa" ||
    text === "navegar pra casa"
  ) {
    return favoriteDestinations.find((item) => item.id === "home") || null;
  }

  if (
    text === "trabalho" ||
    text === "me leva para o trabalho" ||
    text === "me leva pro trabalho" ||
    text === "ir para o trabalho" ||
    text === "ir pro trabalho" ||
    text === "navegar para o trabalho" ||
    text === "navegar pro trabalho"
  ) {
    return favoriteDestinations.find((item) => item.id === "work") || null;
  }

  return null;
}
