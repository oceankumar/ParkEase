import { Link } from "react-router-dom";
import PageContainer from "../components/PageContainer.jsx";
export default function DashboardPage() {
  return (
    <PageContainer
      eyebrow="FOUNDATION PREVIEW"
      title="Room for what comes next."
    >
      <p>
        Role-specific functionality for users, mall owners, guards, and admins
        will be implemented in the next development stages. This page is
        currently a public placeholder.
      </p>
      <Link className="button" to="/">
        Back to Home <span aria-hidden="true">↗</span>
      </Link>
    </PageContainer>
  );
}
