"""The server-rendered HTML pages.

These are thin -- each route just renders a template -- but the templates share
a partial and each pulls a different pair of scripts, so a rename or a dropped
`<script>` tag would otherwise only surface in the browser.
"""

from html.parser import HTMLParser


class _ElementById(HTMLParser):
    """Records the tag name and attributes of the element carrying an id."""

    def __init__(self, target_id):
        super().__init__(convert_charrefs=True)
        self.target_id = target_id
        self.tag = None
        self.attrs = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id") == self.target_id:
            self.tag = tag
            self.attrs = attrs


def element_by_id(html, target_id):
    """Find one element by id, as (tag, attrs); (None, {}) when absent.

    Matching a literal slice of the markup couples a test to attribute order
    and line breaks, so a formatter reflowing a tag breaks the suite without
    changing anything the page does -- which is exactly what happened to the
    gear-link test below. Parsing asks what the test actually means: which
    element carries this id, and what are its attributes?
    """
    parser = _ElementById(target_id)
    parser.feed(html)
    return parser.tag, parser.attrs


def test_index_renders(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]


def test_settings_page_renders(client):
    res = client.get("/settings")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]


def test_settings_link_replaces_the_settings_modal_on_the_dashboard(client):
    """The gear is a link to /settings, and the modal it used to open is gone."""
    body = client.get("/").text
    assert 'href="/settings"' in body
    assert 'id="settings-modal"' not in body


def test_settings_page_carries_every_settings_control(client):
    body = client.get("/settings").text
    for control in (
        "child-list",
        "child-new-name",
        "child-add-btn",
        "settings-left-name",
        "settings-right-name",
        "settings-bottle-type",
        "settings-bottle-unit",
        "settings-save-btn",
    ):
        assert f'id="{control}"' in body, control


def test_gear_navigates_from_the_dashboard_but_marks_position_on_settings(client):
    """Both headers show the gear, but only the dashboard's one navigates.

    A self-link on /settings would reload the page and drop unsaved preference
    edits, so there it is a current-page marker instead.
    """
    tag, attrs = element_by_id(client.get("/").text, "settings-btn")
    assert tag == "a"
    assert attrs.get("href") == "/settings"

    tag, attrs = element_by_id(client.get("/settings").text, "settings-btn")
    assert tag is not None
    assert attrs.get("aria-current") == "page"


def test_settings_page_has_no_cancel_and_offers_a_way_back(client):
    """Cancel was a modal idiom; the back link replaces it."""
    body = client.get("/settings").text
    assert "modal-close" not in body
    assert 'href="/"' in body


def test_both_pages_include_the_shared_confirm_modal(client):
    """The migration offer runs from /settings, the bulk re-assign from the
    dashboard, and both drive the same confirmation markup."""
    for path in ("/", "/settings"):
        assert 'id="confirm-modal"' in client.get(path).text, path


def test_each_page_loads_common_plus_its_own_script(client):
    dashboard = client.get("/").text
    assert "/static/js/common.js" in dashboard
    assert "/static/js/app.js" in dashboard
    assert "/static/js/settings.js" not in dashboard

    settings = client.get("/settings").text
    assert "/static/js/common.js" in settings
    assert "/static/js/settings.js" in settings
    assert "/static/js/app.js" not in settings
