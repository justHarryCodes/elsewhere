import { useEffect, useState } from "react";
import { type City, interiorDoorAt } from "@game/shared";

/**
 * "Press E to go in": shown while the player stands at a building's front door (or at the door inside
 * a room), and E sends them through it. The server checks the door and moves them.
 */
export function DoorPrompt({
  city,
  player,
  onDoor,
}: {
  city: City;
  player: () => { x: number; y: number; z: number } | undefined;
  onDoor: () => void;
}) {
  const [door, setDoor] = useState<{ name: string; inside: boolean } | undefined>();

  useEffect(() => {
    const timer = window.setInterval(() => {
      const at = player();
      const found = at && interiorDoorAt(city.interiors, at.x, at.y, at.z);
      setDoor((previous) => {
        const next = found && { name: found.interior.name, inside: found.inside };
        return previous?.name === next?.name && previous?.inside === next?.inside ? previous : next;
      });
    }, 200);
    return () => window.clearInterval(timer);
  }, [city, player]);

  useEffect(() => {
    if (!door) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyE" || event.repeat || (event.target as HTMLElement | null)?.tagName === "INPUT") return;
      onDoor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [door, onDoor]);

  if (!door) return null;
  return (
    <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-slate-950/80 px-4 py-2 text-sm">
      Press <kbd className="rounded bg-slate-700 px-1.5 py-0.5 font-mono">E</kbd>{" "}
      {door.inside ? "to go out" : `to go into ${door.name === "Your home" ? "your home" : door.name}`}
    </div>
  );
}
