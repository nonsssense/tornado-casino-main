from aiogram import Dispatcher

from admin_panel.handlers import analytics as analytics_h
from admin_panel.handlers import common as common_h
from admin_panel.handlers import dashboard as dashboard_h
from admin_panel.handlers import input_router as input_h
from admin_panel.handlers import payments as payments_h
from admin_panel.handlers import players as players_h
from admin_panel.handlers import promotions as promotions_h
from admin_panel.handlers import search as search_h
from admin_panel.handlers import settings as settings_h


def register_handlers(dp: Dispatcher) -> None:
    common_h.register(dp)
    dashboard_h.register(dp)
    players_h.register(dp)
    promotions_h.register(dp)
    payments_h.register(dp)
    analytics_h.register(dp)
    settings_h.register(dp)
    search_h.register(dp)
    # Text pending-input router must be last among message handlers.
    input_h.register(dp)
