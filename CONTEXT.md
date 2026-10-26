# Helpdesk Live Demo

A public, standalone instance of Helpdesk that a prospect can explore without signing up. Each visitor sees seeded data and acts on it privately in their own browser.

## Language

**Demo Persona**:
The fixed identity a visitor explores as: the Agent Persona or the Customer Persona.
_Avoid_: demo user, guest

**Agent Persona**:
The seeded support lead ("Jamie") a visitor becomes when they choose "Explore as Agent".

**Customer Persona**:
The seeded customer contact a visitor becomes when they choose "Explore as Customer".

**Demo Overlay**:
The private record of everything one visitor has done, kept in their browser and shown on top of the seed data. Visitor-facing copy calls it "your changes".
_Avoid_: local state, cache, sandbox

**Simulated Action**:
An action the visitor performs that changes only their Demo Overlay, never the server.
_Avoid_: fake action, mock

**Blocked Action**:
An action the demo does not simulate. The visitor sees it, but trying it explains that it needs a real instance.

**Seed Data**:
The fictional company's tickets, customers, agents and articles that every visitor starts from.
_Avoid_: fixtures, dummy data

**Scene Ticket**:
A hand-written Seed Data ticket that a Tour Stop depends on, such as the SLA that is about to breach.
_Avoid_: demo ticket, sample ticket

**Reseed**:
The daily refresh that moves Seed Data timestamps forward so the data always looks recent.
_Avoid_: reset

**Restart Demo**:
A visitor clearing their own Demo Overlay to start again.

**Tour Stop**:
One step of the guided tour that points at a feature and, where needed, waits for the visitor to try it.

**Try-it Checklist**:
Optional tasks outside the tour that a visitor can tick off at their own pace.

## Relationships

- A visitor has exactly one **Demo Overlay**, and it is shared by both **Demo Personas** in that browser.
- A **Simulated Action** by the **Customer Persona** (raising a ticket) is visible to the **Agent Persona** in the same browser, and to no other visitor.
- A **Reseed** changes **Seed Data** for everyone; **Restart Demo** changes one **Demo Overlay** only.

## Example dialogue

> **Dev:** "If a visitor replies to a ticket and then reloads, is the reply gone?"
> **Domain expert:** "No, it's a **Simulated Action** kept in their **Demo Overlay**. It goes away only on **Restart Demo**. Nobody else ever sees it."

## Flagged ambiguities

- "Reset" was used for both the daily server refresh and a visitor starting over. These are now **Reseed** and **Restart Demo**.
- "HD Agent" and "HD Customer" are records in Helpdesk, not roles. The **Agent Persona** has the Agent Manager role.
