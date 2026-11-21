import { useEffect, useState } from "react";
import useAuth from "./useAuth.js";
import { sessionRequest } from "../services/authService.js";
import { myAssignments } from "../services/guardService.js";

export default function useMallChoices() {
  const { user } = useAuth();
  const [choices, setChoices] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    async function read() {
      try {
        let list;
        if (user.role === "GUARD") {
          list = (await myAssignments(options)).map((assignment) => ({ id: assignment.mallId, name: assignment.mallName, gateLabel: assignment.gateLabel }));
        } else if (user.role === "ADMIN") list = (await sessionRequest("/admin/malls", options)).data.malls;
        else list = (await sessionRequest("/malls/owner/my-malls", options)).data.malls;
        if (!controller.signal.aborted) {
          setChoices(list.map((mall) => ({ ...mall, id: mall.id || mall._id }))); setError("");
        }
      } catch (err) { if (!controller.signal.aborted) { setChoices([]); setError(err.message); } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    read();
    return () => controller.abort();
  }, [user._id, user.role, revision]);
  return { choices, loading, error, reload: () => { setLoading(true); setRevision((value) => value + 1); } };
}
