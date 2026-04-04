/**
 * RicolaIcon — Ricola "R" icon mark inside a circle.
 * Size is controlled via the `size` prop (px).
 */
export default function RicolaIcon({ size = 36 }) {
  return (
    <img
      src="/ricola-r.png"
      alt="Ricola"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        flexShrink: 0,
        display: "block",
      }}
    />
  );
}
