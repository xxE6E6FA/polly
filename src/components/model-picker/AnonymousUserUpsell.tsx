import { ChatCircleIcon, KeyIcon, LightningIcon } from "@phosphor-icons/react";
import { MONTHLY_MESSAGE_LIMIT } from "@shared/constants";
import { memo } from "react";
import { Link } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";

const AnonymousUserUpsellComponent = () => {
  return (
    <div className="relative p-6">
      <h3 className="mb-2 text-center text-base font-semibold text-foreground">
        Sign in for more features!
      </h3>

      <div className="mb-6 stack-md">
        <div className="flex items-start gap-3">
          <ChatCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <div className="font-medium text-foreground">
              Higher message limits
            </div>
            <div className="text-xs text-muted-foreground">
              {MONTHLY_MESSAGE_LIMIT} messages/month for free
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <KeyIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <div className="font-medium text-foreground">
              Bring your own API keys
            </div>
            <div className="text-xs text-muted-foreground">
              Use OpenAI, Anthropic, Google and OpenRouter models
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <LightningIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm">
            <div className="font-medium text-foreground">Advanced features</div>
            <div className="text-xs text-muted-foreground">
              Custom personas, conversation sharing, and more!
            </div>
          </div>
        </div>
      </div>

      <Link
        to={ROUTES.AUTH}
        className={buttonVariants({
          className: "w-full",
          size: "sm",
          variant: "default",
        })}
      >
        Sign In
      </Link>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Free to use • No credit card required
      </p>
    </div>
  );
};

export const AnonymousUserUpsell = memo(AnonymousUserUpsellComponent);
