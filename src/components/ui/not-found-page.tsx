import { Link } from "react-router-dom";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { Button, buttonVariants } from "@/components/ui/button";

type NotFoundPageProps = {
  title?: string;
  description?: string;
};

export const NotFoundPage = ({
  title = "Page not found",
  description = "The page you're looking for doesn't exist.",
}: NotFoundPageProps) => {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <div className="mx-auto max-w-md stack-xl p-6 text-center">
        <div className="stack-lg">
          <div className="mx-auto flex h-32 w-32 items-center justify-center">
            <AnimatedLogo size={128} />
          </div>

          <div className="stack-sm">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <Link to="/" className={buttonVariants({ size: "lg" })}>
          New Chat
        </Link>
      </div>
    </div>
  );
};
