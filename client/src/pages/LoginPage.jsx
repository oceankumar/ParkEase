import { Link } from "react-router-dom";
import PageContainer from "../components/PageContainer.jsx";
export default function LoginPage() {
  return (
    <PageContainer eyebrow="FOUNDATION PREVIEW" title="Welcome back.">
      <p>
        Login will be added in the authentication stage. No account verification
        is available yet.
      </p>
      <Link className="button" to="/">
        Back to Home <span aria-hidden="true">↗</span>
      </Link>
    </PageContainer>
  );
}
