interface ErrorBannerProps {
  /** Mensagem já em pt-BR, como o repositório devolve. */
  message: string;
}

/**
 * Erro de tela: `role="alert"` para o leitor de tela anunciar sem depender de
 * foco. Fundo transparente de propósito -- o bordão `destructive` sobre
 * `background` mantém contraste acima de 4.5:1, que um preenchimento suave
 * como `bg-destructive/5` deixaria no limite.
 */
export default function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
    >
      {message}
    </p>
  );
}
