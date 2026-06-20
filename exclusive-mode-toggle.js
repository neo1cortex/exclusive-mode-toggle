(async function ExclusiveModeToggle() {
    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    while (
        !window.Spicetify?.Topbar ||
        !window.Spicetify?.Platform?.ExclusiveModeAPI ||
        !window.Spicetify?.showNotification
    ) {
        await sleep(200);
    }

    const BUTTON_LABEL = "Exclusive mode";

    const BUTTON_CLASS = "exclusive-mode-toggle-button";
    const BUTTON_ACTIVE_CLASS = "exclusive-mode-toggle-button--active";
    const BUTTON_OFF_CLASS = "exclusive-mode-toggle-button--off";
    const BUTTON_BUSY_CLASS = "exclusive-mode-toggle-button--busy";

    const ICON = `
        <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M12 2.75a1.25 1.25 0 0 1 1.25 1.25v8a1.25 1.25 0 1 1-2.5 0V4A1.25 1.25 0 0 1 12 2.75Z"></path>
            <path d="M7.05 5.9a1.25 1.25 0 0 1-.12 1.76A6.25 6.25 0 1 0 17.07 7.66a1.25 1.25 0 1 1 1.64-1.88A8.75 8.75 0 1 1 5.29 5.78a1.25 1.25 0 0 1 1.76.12Z"></path>
        </svg>
    `;

    let button;
    let isBusy = false;
    let currentValue = null;
    let syncBusy = false;

    function getAPI() {
        const api = Spicetify.Platform.ExclusiveModeAPI;

        if (!api) {
            throw new Error("ExclusiveModeAPI not available");
        }

        return api;
    }

    async function callMaybeAsync(fn, context, ...args) {
        const result = fn.apply(context, args);

        if (result && typeof result.then === "function") {
            return await result;
        }

        return result;
    }

    async function waitFor(fn, timeout = 3000, interval = 100) {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const result = fn();
            if (result) return result;
            await sleep(interval);
        }

        return null;
    }

    function injectStyle() {
        if (document.getElementById("exclusive-mode-toggle-style")) return;

        const style = document.createElement("style");
        style.id = "exclusive-mode-toggle-style";

        style.textContent = `
            .${BUTTON_CLASS} {
                width: 32px !important;
                height: 32px !important;
                min-width: 32px !important;
                padding: 0 !important;

                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;

                position: relative !important;
                top: 7px !important;

                color: var(--spice-subtext, #b3b3b3) !important;
                border-radius: 10px !important;

                transition:
                    color 120ms ease,
                    background-color 120ms ease,
                    border-color 120ms ease,
                    box-shadow 120ms ease,
                    opacity 120ms ease;
            }

            .${BUTTON_CLASS} svg {
                width: 20px !important;
                height: 20px !important;
                display: block !important;
                flex: 0 0 auto !important;
                margin: 0 !important;
                transform: none !important;
                position: relative !important;
                z-index: 1 !important;
            }

            .${BUTTON_CLASS}:hover {
                color: var(--spice-text, #ffffff) !important;
            }

			.${BUTTON_CLASS}.${BUTTON_ACTIVE_CLASS} {
				color: var(--spice-button, #1ed760) !important;
				background-color: transparent !important;
				box-shadow: none !important;
				border: none !important;
			}

			.${BUTTON_CLASS}.${BUTTON_ACTIVE_CLASS}:hover {
				color: var(--spice-text, #ffffff) !important;
				background-color: transparent !important;
				box-shadow: none !important;
				border: none !important;
			}

            .${BUTTON_CLASS}.${BUTTON_OFF_CLASS}::after {
                content: "";
                position: absolute !important;

                width: 24px !important;
                height: 2.5px !important;

                left: 50% !important;
                top: 50% !important;

                background: var(--spice-subtext, #b3b3b3) !important;
                border-radius: 999px !important;

                transform: translate(-50%, -50%) rotate(-45deg) !important;
                transform-origin: center !important;

                z-index: 2 !important;
                pointer-events: none !important;

                box-shadow:
                    0 0 0 1px color-mix(
                        in srgb,
                        var(--spice-main, #121212) 55%,
                        transparent
                    );
            }

            .${BUTTON_CLASS}.${BUTTON_OFF_CLASS}:hover::after {
                background: var(--spice-text, #ffffff) !important;
            }

            .${BUTTON_CLASS}.${BUTTON_BUSY_CLASS} {
                opacity: 0.55;
                pointer-events: none;
            }
        `;

        document.head.appendChild(style);
    }

    function getButtonElement() {
        return (
            button?.element ||
            button?.button ||
            button?._button ||
            document.querySelector(`[aria-label="${BUTTON_LABEL}"]`) ||
            document.querySelector(`[title="${BUTTON_LABEL}"]`)
        );
    }

    function setTooltip(enabled) {
        if (!button?.tippy) return;

        const content =
            enabled === true
                ? "Exclusive mode ON"
                : enabled === false
                    ? "Exclusive mode OFF"
                    : "ON/OFF Exclusive mode";

        button.tippy.setProps({
            content,
            allowHTML: false
        });
    }

    function setButtonState(enabled) {
        currentValue = enabled;

        const element = getButtonElement();

        if (!element) {
            setTooltip(enabled);
            return;
        }

        element.classList.add(BUTTON_CLASS);

        element.classList.toggle(BUTTON_ACTIVE_CLASS, enabled === true);
        element.classList.toggle(BUTTON_OFF_CLASS, enabled === false);

        element.setAttribute("aria-pressed", enabled === true ? "true" : "false");

        setTooltip(enabled);
    }

    function setBusy(busy) {
        isBusy = busy;

        const element = getButtonElement();
        if (!element) return;

        element.classList.toggle(BUTTON_BUSY_CLASS, busy);
        element.setAttribute("aria-disabled", busy ? "true" : "false");
    }

    async function getExclusiveModeEnabled() {
        const api = getAPI();

        if (typeof api.getExclusiveModeEnabled === "function") {
            const value = await callMaybeAsync(api.getExclusiveModeEnabled, api);

            if (typeof value === "boolean") {
                return value;
            }

            if (value && typeof value === "object") {
                if (typeof value.enabled === "boolean") return value.enabled;
                if (typeof value.value === "boolean") return value.value;
                if (typeof value.exclusiveModeEnabled === "boolean") {
                    return value.exclusiveModeEnabled;
                }
            }
        }

        if (typeof api.exclusiveModeEnabled === "boolean") {
            return api.exclusiveModeEnabled;
        }

        return null;
    }

    async function setExclusiveModeEnabled(enabled) {
        const api = getAPI();

        if (typeof api.setExclusiveModeEnabled !== "function") {
            throw new Error("setExclusiveModeEnabled not available");
        }

        await callMaybeAsync(api.setExclusiveModeEnabled, api, enabled);

        /*
            Spotify puede tardar un poco en reflejar el estado real.
            Esperamos y luego confirmamos.
        */
        await sleep(250);

        const confirmedValue = await getExclusiveModeEnabled();

        if (confirmedValue !== null) {
            return confirmedValue;
        }

        return enabled;
    }

    async function syncState() {
        if (syncBusy) return currentValue;

        syncBusy = true;

        try {
            const enabled = await getExclusiveModeEnabled();
            setButtonState(enabled);
            return enabled;
        } catch (error) {
            console.debug("[ExclusiveModeToggle] Sync failed", error);
            setButtonState(null);
            return null;
        } finally {
            syncBusy = false;
        }
    }

    async function toggleExclusiveMode() {
        if (isBusy) return;

        setBusy(true);

        try {
            let enabled = await getExclusiveModeEnabled();

            if (enabled === null) {
                enabled = currentValue === true;
            }

            const nextValue = !enabled;
            const finalValue = await setExclusiveModeEnabled(nextValue);

            setButtonState(finalValue);

            Spicetify.showNotification(
                finalValue
                    ? "Exclusive mode ON"
                    : "Exclusive mode OFF",
                false
            );
        } catch (error) {
            console.error("[ExclusiveModeToggle]", error);
            Spicetify.showNotification("Couldn't change Exclusive mode", true);

            await syncState();
        } finally {
            setBusy(false);
        }
    }

    injectStyle();

    button = new Spicetify.Topbar.Button(
        BUTTON_LABEL,
        ICON,
        toggleExclusiveMode
    );

    await waitFor(() => getButtonElement(), 3000, 100);

    setButtonState(null);
    await syncState();

    /*
        Sincronización ligera por si cambias Exclusive Mode desde Settings.
        No abre configuración ni modifica la navegación.
    */
    setInterval(syncState, 5000);
})();