/**
 * RicolaIcon — shows just the "R" from the Ricola wordmark PNG,
 * clipped inside a circle. Size is controlled via the `size` prop (px).
 */
export default function RicolaIcon({ size = 36 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#fff",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        flexShrink: 0,
      }}
    >
      <img
        src="/ricola-logo.png"
        alt="Ricola"
        style={{
          height: "62%",
          width: "auto",
          marginLeft: "8%",
        }}
      />
    </div>
  );
}
