// 🔥 ALTERAÇÃO PRINCIPAL: múltiplas rotas + seleção inteligente

// ENCONTRE ESTE BLOCO no seu arquivo:

directionsService.route(
  {
    origin: currentOrigin,
    destination: currentDestination,
    travelMode: google.maps.TravelMode.DRIVING,
    provideRouteAlternatives: false, // ❌ antigo
    drivingOptions: {
      departureTime: new Date(),
      trafficModel: google.maps.TrafficModel.BEST_GUESS,
    },
  },

// 🔥 SUBSTITUA POR:

directionsService.route(
  {
    origin: currentOrigin,
    destination: currentDestination,
    travelMode: google.maps.TravelMode.DRIVING,
    provideRouteAlternatives: true, // ✅ Waze PRO
    drivingOptions: {
      departureTime: new Date(),
      trafficModel: google.maps.TrafficModel.BEST_GUESS,
    },
  },
  (result, status) => {
    if (status !== "OK" || !result || !result.routes?.length) {
      console.error("Erro ao calcular rota:", status, result);
      setErrorMessage(`Não foi possível calcular a rota (${status}).`);
      return;
    }

    setErrorMessage("");

    // 🔥 ESCOLHE A MELHOR ROTA AUTOMATICAMENTE
    let bestIndex = 0;
    let bestDuration = Infinity;

    result.routes.forEach((route, index) => {
      const duration =
        route.legs?.[0]?.duration_in_traffic?.value ||
        route.legs?.[0]?.duration?.value ||
        999999;

      if (duration < bestDuration) {
        bestDuration = duration;
        bestIndex = index;
      }
    });

    // 🔥 aplica rota mais rápida
    directionsRenderer.current?.setDirections(result);
    directionsRenderer.current?.setRouteIndex(bestIndex);

    const bestRoute = result.routes[bestIndex];
    const bestLeg = bestRoute?.legs?.[0];

    if (!bestLeg) return;

    routePathRef.current = flattenOverviewPath(bestRoute);

    const destinationPosition = {
      lat: destination.latitude,
      lng: destination.longitude,
    };

    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new google.maps.Marker({
        position: destinationPosition,
        map: mapObj.current,
        title: destination.name || "Destino",
      });
    } else {
      destinationMarkerRef.current.setPosition(destinationPosition);
      destinationMarkerRef.current.setTitle(destination.name || "Destino");
      destinationMarkerRef.current.setMap(mapObj.current);
    }

    focusNavigationCamera(currentOrigin, headingRef.current, location.speed);

    navigationReadyRef.current = true;
    offRouteStartedAtRef.current = null;
    offRouteSampleCountRef.current = 0;
    lastConfirmedOnRouteRef.current = currentOrigin;

    const steps: Step[] = bestLeg.steps.map((step) => ({
      instruction: step.instructions.replace(/<[^>]+>/g, ""),
      end_location: {
        lat: step.end_location.lat(),
        lng: step.end_location.lng(),
      },
    }));

    onStepsUpdate?.(steps);
  }
);