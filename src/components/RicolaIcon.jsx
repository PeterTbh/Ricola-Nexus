/**
 * RicolaIcon — Ricola "R" icon mark inside a circle.
 * Size is controlled via the `size` prop (px).
 */
export default function RicolaIcon({ size = 36 }) {
  const imgSize = Math.round(size * 0.76);
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
      }}
    >
      <img
        src="/ricola-r.png"
        alt="Ricola"
        style={{
          width: imgSize,
          height: imgSize,
          objectFit: "contain",
          display: "block",
        }}
      />
    </div>
  );
}
