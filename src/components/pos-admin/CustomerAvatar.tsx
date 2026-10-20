import { customerAvatarTone, customerInitials } from "./customer-labels";

/** Círculo con las iniciales del cliente, del mismo tono en la lista y el detalle. */
export function CustomerAvatar({ id, name, size = 36 }: { id: string; name: string; size?: number }) {
  const tone = customerAvatarTone(id);
  return (
    <span
      className="customer-avatar"
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: tone.bg,
        color: tone.fg,
      }}
    >
      {customerInitials(name)}
    </span>
  );
}
