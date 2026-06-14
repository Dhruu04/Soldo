import { useState } from "react";
import { Trash2, Activity, Package, ReceiptText, BarChart3, Boxes, Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { useStore, formatEUR } from "@/lib/store";
import { useT, useCurrentLang } from "@/lib/i18n";
import type { ActivityEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ActivityEntry["kind"], typeof Package> = {
  product: Package,
  order: ReceiptText,
  expense: BarChart3,
  stock: Boxes,
  system: SettingsIcon,
};

export function ActivityLogPanel() {
  const t = useT();
  const lang = useCurrentLang();
  const activity = useStore((s) => s.activity);
  const clearActivity = useStore((s) => s.clearActivity);
  const [kind, setKind] = useState<"all" | ActivityEntry["kind"]>("all");

  const list = activity.filter((a) => kind === "all" || a.kind === kind);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            {t("act.title")}
          </span>
          <div className="flex items-center gap-2">
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("act.filter.all")}</SelectItem>
                <SelectItem value="product">{t("act.kind.product")}</SelectItem>
                <SelectItem value="order">{t("act.kind.order")}</SelectItem>
                <SelectItem value="expense">{t("act.kind.expense")}</SelectItem>
                <SelectItem value="stock">{t("act.kind.stock")}</SelectItem>
                <SelectItem value="system">{t("act.kind.system")}</SelectItem>
              </SelectContent>
            </Select>
            {activity.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" title={t("act.clear")}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("act.clear")}?</AlertDialogTitle>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={clearActivity}>{t("common.confirm")}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {list.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">{t("act.empty")}</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto divide-y">
            {list.slice(0, 200).map((a) => {
              const Icon = KIND_ICON[a.kind];
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="h-8 w-8 rounded-md bg-muted grid place-items-center shrink-0">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px] capitalize">{t(`act.kind.${a.kind}`)}</Badge>
                      <span className="text-xs text-muted-foreground">{t(`act.action.${a.action}`) || a.action}</span>
                    </div>
                    <div className="font-medium truncate">{a.summary}</div>
                  </div>
                  <div className="text-right shrink-0">
                    {typeof a.amount === "number" && (
                      <div
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          a.amount < 0 ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {formatEUR(a.amount)}
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(a.created_at).toLocaleString(lang === "it" ? "it-IT" : "en-US")}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
