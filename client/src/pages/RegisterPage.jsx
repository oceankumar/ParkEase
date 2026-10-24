import { Link } from "react-router-dom";
import PageContainer from "../components/PageContainer.jsx";
export default function RegisterPage() {
  return (
    <PageContainer
      eyebrow="FOUNDATION PREVIEW"
      title="Your next visit starts here."
    >
      <p>
        Registration will be added in the authentication stage. Accounts cannot
        be created yet.
      </p>
      <Link className="button" to="/">
        Back to Home <span aria-hidden="true">↗</span>
      </Link>
    </PageContainer>
  );
}
