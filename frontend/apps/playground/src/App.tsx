import type { ContentLoader } from "@cc/application";
import { RuntimeContentProvider } from "./content/runtime";
import { AssessmentPage } from "./pages/AssessmentPage";
import { ChallengePage } from "./pages/ChallengePage";
import { GuardianPage } from "./pages/GuardianPage";
import { HomePage } from "./pages/HomePage";
import { IdiomPracticePage } from "./pages/IdiomPracticePage";
import { LessonPage } from "./pages/LessonPage";
import { PoemPracticePage } from "./pages/PoemPracticePage";
import { SummaryPage } from "./pages/SummaryPage";
import { useRoute } from "./router";

function RoutedApp() {
  const route = useRoute();
  switch (route) {
    case "/assessment":
      return <AssessmentPage />;
    case "/home":
      return <HomePage />;
    case "/idiom-practice":
      return <IdiomPracticePage />;
    case "/poem-practice":
      return <PoemPracticePage />;
    case "/challenge":
      return <ChallengePage />;
    case "/lesson":
      return <LessonPage />;
    case "/summary":
      return <SummaryPage />;
    case "/guardian":
      return <GuardianPage />;
  }
}

export function App({ contentLoader }: { contentLoader?: ContentLoader } = {}) {
  return (
    <RuntimeContentProvider
      {...(contentLoader === undefined ? {} : { loader: contentLoader })}
    >
      <RoutedApp />
    </RuntimeContentProvider>
  );
}
