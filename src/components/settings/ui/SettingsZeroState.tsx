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
    <Card className="p-12 text-center">
      <div className="mb-4 flex justify-center text-muted-foreground/40">
        {icon}
      </div>
      <h3 className="mb-2 font-medium">{title}</h3>
      {description && (
        <p className="mb-6 text-sm text-muted-foreground">{description}</p>
      )}
      {cta && <div className="flex justify-center">{cta}</div>}
    </Card>
  );
};
