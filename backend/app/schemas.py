from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class Persona(BaseModel):
    model_config = ConfigDict(extra="forbid")
    age: int = Field(ge=18, le=100)
    gender: Literal["Homme", "Femme"]
    tech_level: int = Field(ge=1, le=10)
    device_type: Literal["mobile", "desktop"]
    traits: str = Field(default="", max_length=1000)
    multiplier: int = Field(default=1, ge=1, le=50)


class CampaignCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: HttpUrl
    goal: str = Field(
        default="Exploration critique : trouvez les bugs et frictions.", max_length=4000
    )
    profiles: list[Persona] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def clean_goal(self):
        self.goal = self.goal.strip() or "Exploration critique : trouvez les bugs et frictions."
        return self


class Finding(BaseModel):
    description: str
    severity: Literal["low", "medium", "high"]
    evidence_steps: list[int] = Field(min_length=1)
    recommendation: str


class AuditReport(BaseModel):
    ux_score: int = Field(ge=0, le=100)
    summary: str
    frustrations: list[str]
    positive_points: list[str]
    improvements: list[str]
    findings: list[Finding] = Field(default_factory=list)


class CampaignSummary(BaseModel):
    summary: str
    recurring_problems: list[str]
    priorities: list[str]
    limitations: list[str]
