window.loadGoogleMaps = async function (apiBaseUrl) {
    if (window.google?.maps) return window.google.maps;

    if (!window.googleMapsLoadPromise) {
        window.googleMapsLoadPromise = (async () => {
            const response = await fetch(
                `${apiBaseUrl}/api/config/google-maps`,
                { cache: "no-store" }
            );
            const result = await response.json();
            if (!response.ok || !result.success || !result.apiKey) {
                throw new Error(
                    result.message || "Google Maps is not configured."
                );
            }

            await new Promise((resolve, reject) => {
                const script = document.createElement("script");
                script.src =
                    "https://maps.googleapis.com/maps/api/js?key=" +
                    encodeURIComponent(result.apiKey) +
                    "&v=weekly";
                script.async = true;
                script.onload = resolve;
                script.onerror = () => reject(
                    new Error("Google Maps could not be loaded.")
                );
                document.head.appendChild(script);
            });

            return window.google.maps;
        })();
    }

    return window.googleMapsLoadPromise;
};
