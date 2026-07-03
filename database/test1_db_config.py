# set of db for the project
from sqlalchemy import ForeignKey, create_engine, text, Connection, MetaData, Table, Column, Integer, String, BigInteger, ForeignKey
# //user:password@host/dbname
engine = create_engine("sqlite+pysqlite:///:memory:", echo=True)
metadata = MetaData()

user_table = Table(
    "users",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", BigInteger, unique=True),
    Column("fullname", String),
)

address = Table(
    "addresses",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", ForeignKey("users.user_id")),
    Column("email", String, nullable=False),
)

metadata.create_all(engine)
metadata.drop_all(engine)