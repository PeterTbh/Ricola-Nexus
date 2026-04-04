/**
 * RicolaIcon — Ricola "R" icon mark inside a circle.
 * Size is controlled via the `size` prop (px).
 */
export default function RicolaIcon({ size = 36 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#F5C500",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: "12%",
      }}
    >
      <img
        src="/ricola-r.png"
        alt="Ricola"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
    </div>
  );
}
