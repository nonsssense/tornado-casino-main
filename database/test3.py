# Построение запросов Core
# Работа с данными Core 

import sqlalchemy as sa

engine = sa.create_engine("sqlite+pysqlite:///:memory:", echo=True)
metadata = sa.MetaData()

user_table = sa.Table(
    "users",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, unique=True, autoincrement=True),
    sa.Column("user_name", sa.String(30)),    
    sa.Column("fullname", sa.String(50))
)

address_table = sa.Table(
    "addresses",
    metadata,
    sa.Column("id", sa.Integer, primary_key=True, unique=True, autoincrement=True),
    sa.Column("email_address", sa.String(50), nullable=False),
    sa.Column("user_id", sa.ForeignKey("users.id")),
)


metadata.create_all(engine)

stmt = sa.insert(user_table).values(user_name="test", fullname="test test")
print(stmt)
        