import { useEffect } from "react";

export function usePreventSave() {
  useEffect(() => {
    window.addEventListener("keydown", listener);
    function listener(event: KeyboardEvent) {
      if (event.metaKey && event.key === "s") {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    return () => {
      window.removeEventListener("keydown", listener);
    };
  });
}
