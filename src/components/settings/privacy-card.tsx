import type { ReactNode } from 'react';
import { Bot, Globe, Lock } from 'lucide-react';
import { Card, Section } from '@/components/ds/surface';
import { InfoLink } from '@/components/ds/info-link';

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="relative flex gap-3 px-4 py-3.5 after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden">
      <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-[var(--hi-gold-tint)] text-[var(--hi-gold)] [&_svg]:size-[18px]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[length:var(--hi-text-body)] leading-snug text-[var(--hi-text)]">{title}</div>
        <div className="mt-0.5 text-[length:var(--hi-text-caption)] leading-relaxed text-[var(--hi-text-3)]">{children}</div>
      </div>
    </div>
  );
}

/**
 * Plain-language answer to "who sees my portfolio?".
 * Keep it true to the code: the only network calls are MOEX ISS and the public
 * heroincome-data files on GitHub, and they carry tickers / ISINs only.
 */
export function PrivacyCard() {
  return (
    <Section title="Кто видит ваш портфель" action={<InfoLink section="storage" className="-my-2 -mr-1 flex" />}>
      <Card className="overflow-hidden">
        <Point icon={<Lock />} title="Только вы">
          У Рантье нет сервера и регистрации. Счета, количество бумаг и суммы хранятся в браузере на этом устройстве и никуда не отправляются.
        </Point>
        <Point icon={<Globe />} title="В сеть уходят только тикеры">
          Чтобы узнать цены и выплаты, приложение спрашивает Мосбиржу и открытые файлы с данными dohod.ru и «Паруса» на GitHub — по тикеру, без количества и сумм.
        </Point>
        <Point icon={<Bot />} title="Импорт через ИИ — по вашему выбору">
          Если отправите отчёт брокера ChatGPT или Claude, его увидит этот сервис. Импорт отчёта Сбера и ручной ввод работают без посредников.
        </Point>
      </Card>
    </Section>
  );
}
