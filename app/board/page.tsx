import { BoardView } from "./board-view";

export const metadata = { title: "Order status" };

/** Public customer-facing screen: which order numbers are being prepared or ready. */
export default function BoardPage() {
  return <BoardView />;
}
