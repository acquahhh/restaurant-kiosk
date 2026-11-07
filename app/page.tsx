import { redirect } from "next/navigation";

// The root of the deployment is the kiosk. Staff screens live at /kitchen and /admin.
export default function Home() {
  redirect("/kiosk");
}
