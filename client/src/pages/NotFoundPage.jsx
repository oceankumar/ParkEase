import { Link } from "react-router-dom";
import PageContainer from "../components/PageContainer.jsx";
export default function NotFoundPage() {
  return (
    <PageContainer eyebrow="404 · PAGE NOT FOUND" title="This space is empty.">
      <p>We could not find that page. Let’s get you back on track.</p>
      <Link className="button" to="/">
        Back to Home <span aria-hidden="true">↗</span>
      </Link>
    </PageContainer>
  );
}
