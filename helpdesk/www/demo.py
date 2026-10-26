import frappe

from helpdesk.demo import is_enabled

no_cache = 1


def get_context(context):
    """The live demo's landing page: pick a persona or start a trial."""
    if not is_enabled():
        raise frappe.PageDoesNotExistError
