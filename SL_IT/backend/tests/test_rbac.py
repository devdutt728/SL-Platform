from app.core.roles import Role, has_required_role


def test_superadmin_bypass():
    assert has_required_role([Role.SUPERADMIN], [Role.ADMIN]) is True
    assert has_required_role([Role.SUPERADMIN], [Role.IT_AGENT]) is True


def test_admin_roles():
    assert has_required_role([Role.ADMIN], [Role.ADMIN]) is True
    assert has_required_role([Role.ADMIN], [Role.IT_AGENT]) is False


def test_it_agent_role():
    assert has_required_role([Role.IT_AGENT], [Role.IT_AGENT]) is True
    assert has_required_role([Role.IT_AGENT], [Role.ADMIN]) is False
