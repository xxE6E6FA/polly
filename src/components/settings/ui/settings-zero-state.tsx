import { Card } from "@/components/ui/card";

interface SettingsZeroStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  cta?: React.ReactNode;
}

export const SettingsZeroState = ({
  icon,
  title,
  description,
  cta,
}: SettingsZeroStateProps) => {
  return (
    <Card className="p-10 sm:p-12 text-center bg-card/95 backdrop-blur-xs">
      <div className="mb-4 flex justify-center text-muted-foreground/40">
        {icon}
      </div>
      <h3 className="mb-2 font-medium text-lg">{title}</h3>
      {description && (
        <p className="mb-6 text-sm text-muted-foreground leading-relaxed max-w-[52ch] mx-auto">
          {description}
        </p>
      )}
      {cta && <div className="flex justify-center">{cta}</div>}
    </Card>
  );
};
