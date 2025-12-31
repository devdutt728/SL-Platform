import pytest

from app.models.platform import DimPerson
from app.services.user_service import prevent_last_superadmin_change


@pytest.mark.asyncio
async def test_last_superadmin_protection(db_session):
    user = DimPerson(
        person_id="1",
        person_code="P-1",
        email="root@example.com",
        first_name="Root",
        last_name="Admin",
        role_id=1,
        status="working",
        is_deleted=0,
    )
    db_session.add(user)
    await db_session.commit()

    with pytest.raises(ValueError):
        await prevent_last_superadmin_change(
            db_session,
            person=user,
            new_role_id=2,
            new_status="working",
        )


@pytest.mark.asyncio
async def test_allow_role_change_when_multiple_superadmins(db_session):
    user1 = DimPerson(
        person_id="1",
        person_code="P-1",
        email="root1@example.com",
        first_name="Root",
        last_name="One",
        role_id=1,
        status="working",
        is_deleted=0,
    )
    user2 = DimPerson(
        person_id="2",
        person_code="P-2",
        email="root2@example.com",
        first_name="Root",
        last_name="Two",
        role_id=1,
        status="working",
        is_deleted=0,
    )
    db_session.add_all([user1, user2])
    await db_session.commit()

    await prevent_last_superadmin_change(
        db_session,
        person=user1,
        new_role_id=2,
        new_status="working",
    )
