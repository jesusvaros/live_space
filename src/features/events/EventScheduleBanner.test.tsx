import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EventScheduleBanner, { scheduleHeadline } from './EventScheduleBanner';
import { mapSchedule, scheduleState } from '../../services/eventManagement.service';
import { noticeBody, noticeTitle } from '../../services/eventNotices.service';
import { cancelResultText } from '../../components/pro/EventScheduleActions';
import { qrValidUntil } from '../../pages/EventQr';

const mocks = vi.hoisted(() => ({ cancelEvent: vi.fn(), postponeEvent: vi.fn() }));
vi.mock('../../services/eventManagement.service', async () => {
  const actual = await vi.importActual<typeof import('../../services/eventManagement.service')>('../../services/eventManagement.service');
  return {
    ...actual,
    eventManagementService: { ...actual.eventManagementService, cancelEvent: mocks.cancelEvent, postponeEvent: mocks.postponeEvent },
  };
});

afterEach(cleanup);

const base = { cancelledAt: null, cancelReason: null, postponedFrom: null, dateTbc: false };

describe('schedule state', () => {
  it('reads the row and picks one state', () => {
    expect(mapSchedule({ id: 'x' })).toBeNull();
    expect(scheduleState(mapSchedule({ date_tbc: false, cancelled_at: null }))).toBeNull();
    expect(scheduleState({ ...base, cancelledAt: '2026-12-01T00:00:00Z', dateTbc: true })).toBe('cancelled');
    expect(scheduleState({ ...base, dateTbc: true, postponedFrom: '2026-12-01T00:00:00Z' })).toBe('tbc');
    expect(scheduleState({ ...base, postponedFrom: '2026-12-01T00:00:00Z' })).toBe('postponed');
    expect(scheduleHeadline({ ...base, postponedFrom: '2026-12-01T00:00:00Z' })).toBe('NUEVA FECHA');
  });

  it('says what happened to the merch when cancelling', () => {
    expect(cancelResultText(0, 0)).toBe('Cancelado.');
    expect(cancelResultText(2, 1)).toBe('Cancelado. 2 reservas liberadas. 1 pedido pagado: devuélvelos desde Stripe.');
  });

  it('builds the notice texts', () => {
    expect(noticeTitle({ kind: 'cancelled' })).toBe('Cancelado');
    expect(noticeTitle({ kind: 'date_tbc' })).toBe('Aplazado');
    expect(noticeBody({ kind: 'cancelled', eventName: 'Sticky M.A.', startsAt: null })).toBe('Sticky M.A.');
    expect(noticeBody({ kind: 'postponed', eventName: 'Sticky M.A.', startsAt: '2026-12-05T20:00:00Z' })).toMatch(/^Sticky M\.A\. · /);
  });

  it('keeps a concert QR valid until 72 h after the concert', () => {
    expect(qrValidUntil({ starts_at: '2026-12-01T21:00:00Z', ends_at: null }).toISOString()).toBe('2026-12-05T03:00:00.000Z');
    expect(qrValidUntil({ starts_at: '2026-12-01T21:00:00Z', ends_at: '2026-12-01T23:00:00Z' }).toISOString()).toBe(
      '2026-12-04T23:00:00.000Z',
    );
  });
});

describe('EventScheduleBanner', () => {
  it('shows nothing for a normal concert', () => {
    const { container } = render(<EventScheduleBanner schedule={base} startsAt="2026-12-01T21:00:00Z" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows CANCELADO with the reason', () => {
    render(
      <EventScheduleBanner
        schedule={{ ...base, cancelledAt: '2026-11-24T10:00:00Z', cancelReason: 'Enfermedad del cantante' }}
        startsAt="2026-12-01T21:00:00Z"
      />,
    );
    expect(screen.getByRole('status', { name: 'CANCELADO' })).toBeInTheDocument();
    expect(screen.getByText('Enfermedad del cantante')).toBeInTheDocument();
  });

  it('shows «Fecha por confirmar» when postponed without a date', () => {
    render(<EventScheduleBanner schedule={{ ...base, dateTbc: true }} startsAt="2026-12-01T21:00:00Z" />);
    expect(screen.getByText('APLAZADO')).toBeInTheDocument();
    expect(screen.getByText('Fecha por confirmar')).toBeInTheDocument();
  });
});

describe('EventScheduleActions', () => {
  const event = {
    id: 'e1',
    name: 'Concierto',
    starts_at: '2026-12-01T21:00:00Z',
    ends_at: null,
    ticket_url: null,
    image_url: null,
    poster_thumb_url: null,
    image_source: null,
    status: 'published',
    city: 'Madrid',
    venue_place_id: 'v1',
    venue_name: 'Sala',
    manager_locked_fields: [],
    headliner: null,
    schedule: base,
  };

  it('cancels in two steps and reports the released reservations', async () => {
    const { default: EventScheduleActions } = await import('../../components/pro/EventScheduleActions');
    mocks.cancelEvent.mockResolvedValue({ releasedOrders: 3, paidOrders: 0 });
    const onDone = vi.fn();
    render(<EventScheduleActions event={event} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar concierto' }));
    fireEvent.change(screen.getByPlaceholderText('Motivo (opcional)'), { target: { value: ' Lluvia ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.cancelEvent).toHaveBeenCalledWith('e1', 'Lluvia');
    expect(screen.getByRole('status')).toHaveTextContent('3 reservas liberadas');
  });

  it('postpones without a date as «fecha por confirmar»', async () => {
    const { default: EventScheduleActions } = await import('../../components/pro/EventScheduleActions');
    mocks.postponeEvent.mockResolvedValue(undefined);
    const onDone = vi.fn();
    render(<EventScheduleActions event={event} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aplazar' }));
    fireEvent.click(screen.getByLabelText('Fecha por confirmar'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplazar' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mocks.postponeEvent).toHaveBeenCalledWith('e1', null, null);
  });

  it('asks for a date when postponing to a new one', async () => {
    const { default: EventScheduleActions } = await import('../../components/pro/EventScheduleActions');
    render(<EventScheduleActions event={event} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aplazar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aplazar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Elige la nueva fecha');
  });
});
