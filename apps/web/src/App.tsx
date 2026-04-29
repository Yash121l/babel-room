import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { DevSimulator, Home, Room, RoomSummary } from "./pages";

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dev/simulator" element={<DevSimulator />} />
        <Route path="/room/:roomId/summary" element={<RoomSummary />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
