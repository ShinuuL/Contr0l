import { useTheme } from "../theme/ThemeProvider";
import { AppearanceSelector } from "../theme/AppearanceSelector";
import ScreenHeader, { SCREEN_SECTION_CLASS } from "../../components/ui/ScreenHeader";

export default function SettingsScreen() {
  const TITLE_ID = "settings-title";
  const { resolvedTheme, nightAccent, setNightAccent } = useTheme();

  return (
    <section className={SCREEN_SECTION_CLASS} aria-labelledby={TITLE_ID}>
      <ScreenHeader id={TITLE_ID} title="Configurações" />
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-foreground">Aparência</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha o tema do aplicativo.
          </p>
          <div className="mt-4">
            <AppearanceSelector />
          </div>
        </div>

        {resolvedTheme === "night" && (
          <div className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-base font-semibold text-foreground">Destaque do tema Noturno</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Personalize a cor de destaque (botões, links e foco) do tema Noturno.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-foreground">
                Cor de destaque
                <input
                  type="color"
                  value={nightAccent ?? "#7aa2f7"}
                  onChange={(e) => setNightAccent(e.target.value)}
                  className="h-11 w-14 cursor-pointer rounded-lg border border-control-border bg-background p-1"
                  aria-label="Escolher cor de destaque do tema Noturno"
                />
              </label>
              {nightAccent && (
                <button
                  type="button"
                  onClick={() => setNightAccent(null)}
                  className="h-11 rounded-lg border border-border px-4 text-sm text-muted-foreground hover:bg-background"
                >
                  Usar padrão
                </button>
              )}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-foreground">Sobre</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configurações adicionais podem aparecer aqui no futuro.
          </p>
        </div>
      </div>
    </section>
  );
}
