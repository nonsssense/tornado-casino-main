from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, select
from sqlalchemy.orm import Mapped, as_declarative, declared_attr, mapped_column, Session

engine = create_engine("sqlite+pysqlite:///:memory:", echo=True)


# Создание таблиц с помощью ORM
@as_declarative()
class AbstractModel():
    id: Mapped[int] = mapped_column(autoincrement=True, primary_key=True)

    __allow_unmapped__ = False

    @classmethod
    @declared_attr
    def __tablename__(cls):
        return cls.__name__.lower()


class UserModel(AbstractModel):
    __tablename__ = "users"
    user_id: Mapped[int] = mapped_column(unique=True)
    name: Mapped[str] = mapped_column(String(30))
    fullname: Mapped[str] = mapped_column()


class AddressModel(AbstractModel):
    __tablename__ = "addresses"
    email: Mapped[str] = mapped_column(String(50), nullable=False)
    user_id= mapped_column(ForeignKey("users.id"))


# Создание обьектов таблиц 



with Session(engine) as session:
    with session.begin():
        AbstractModel.metadata.create_all(engine)
        user = UserModel(user_id=1, name="John", fullname="John Doe")
        session.add(user)
    with session.begin():
        res = session.execute(select(UserModel).where(UserModel.user_id == 1))
        user = res.scalar()
        