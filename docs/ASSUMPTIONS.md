# Assumptions about unclear source data

Each item names the decision taken and where to change it.

## Checklists
1. **Status codes.** The printed form says *P/F/NA/RECT*. Inspectors hand-write *P/F/M* on the sheet, and the client confirmed **M = Maintenance**. The app offers **P · F · M · NA · RECT**.
   - **F, M and RECT require a remark.**
   - M keeps the asset in service. The certificate reads "Fit for use — maintenance advised".
   - RECT counts as a defect that was identified and fixed on site.
2. **The functional test follows the checklist (client instruction).** It is locked until every check is answered. If any check is Fail it is not performed (recorded as Not applicable, and the inspection can be submitted without it). It opens only when every check is P or M (NA or Rectified also count), and then Pass / Fail applies. The rule is enforced on the device and on the server.
3. **"Test required by manufacturer / standard?"** Once the test opens, this Yes / No question is asked first. If the answer is No, Pass / Fail is recorded as Not applicable.
4. **Interval.** Inspections are **quarterly: next due = inspection date + 90 days** for all four types, as written on the wheelchair form and confirmed by the client. The interval is configurable per template.
5. **Re-test window.** The default is 7 days (configurable per template). A re-test is a full inspection: a clean re-test clears open defects, restores service and resets the due date.
6. **Safety-critical items** take the asset out of service on Fail:
   - Wheelchair: #3 wheel locks, #9 restraints, #10 braking
   - Scoop stretcher: #1 cracks, #3 locking pins, #7 restraints, #9 locks engaged
   - A failed load test also takes the asset out of service.
   - A non-critical Fail keeps the asset in use but flags "re-test required".
7. **Foldable stretcher checklist.** No paper form was supplied for it. Ten items were drafted in the same style as the scoop stretcher. It is marked *"Drafted — needs client sign-off"* in Admin → Templates and on the certificate.
8. **Duplicate rows on the paper form.** "Inspection Date" / "Date of Inspection" are linked (one value shown twice). "Equipment Asset ID / Serial No." holds our asset tag and "Serial Number / Asset ID" holds the manufacturer serial. "Technician" and "Inspection Performed By" are both kept; the second defaults to the first and can be changed.
9. **Master Inspection & Fitness Certificate.** Its layout was not supplied. A certificate was designed in the same visual language (verdict, equipment and site details, P/F/M/NA/RECT counts, defects with corrective-action reference, declaration, two signatures). Send the real layout and `client/src/lib/pdf.ts › drawCertificate` can be matched to it.
10. **Measurements.** Numeric fields are added where a value is meaningful: tyre pressure on wheelchair #2 (pneumatic tyres only, optional) and extended length on scoop #5. More can be added in a template.

## Inventory spreadsheet
11. **Single client.** All 331 units are imported under **JLL**, matching "Customer / Organization: JLL" on the forms.
12. **Three products only: wheelchair, scoop stretcher, foldable stretcher** (client decision). "Clothe / Cloth / Clother Stretcher" is a foldable stretcher. A plain "Stretcher" or "NA" in the sheet (61 foldable units in total, 36 of them unspecified, mainly Magma, The Skyview and ODC) is also taken to be foldable and flagged *type inferred*, so it can be corrected on site.
13. **Quantities.** One record is created per unit (331, which matches the sheet total). Counts written in the text are honoured, for example "21Nos are Med star", "Vissco (1 no's); … -6 no's", "(balance)" and "Scoop Stretcher-6". Where no count is given, the remainder is split evenly. "1. Med-e" is read as list numbering, not as a quantity.
14. **Makes.** Spellings are normalised (MDDIPL / M-HDDIPL / HDDIPL / Mhddipl → Mobile Hospital Designers & Developers; Med-e / Med move / Medemove → Med-e-Move; "Fighter" → Karma Healthcare, model Fighter). "Not available", "NA", "N/A", "No Brand name" and "Generic (No Branding)" are recorded as **unknown** and flagged, never discarded. Lists such as "Vissco Superio/ Fighter/Easy care/…" are stored as *candidate makes* and flagged *ambiguous* until an inspector confirms the make on site. "Standard" is kept as written.
15. **Ages.** The sheet has no date. Its compile date was **derived as 30 Jul 2026** from the NKP row ("Pkd On: 12 May 2023; 3 years, 2 months, 18 days"). Purchase dates are estimated from that date and flagged *estimated*.
    - "4 are 8 Years -and 2 are 7 years" is split per unit.
    - "Scoop Stretcher 1 – 1 year, Scoop Stretcher 2 – 3 years" is assigned per unit.
    - Ranges ("4-5 years") use the older value.
    - Floor-split ages ("GF to 3rd Floor - 8 Years; 4th & 5th Floors - 7 Years") cannot be mapped to individual units, so they are flagged *ambiguous* with the floor hint kept.
16. **Floors.** The sheet has no floors, so every asset starts as *Unassigned*. Inspectors use **Select → Move to floor** on site. The two paper samples are placed on NKP 10th Floor.
17. **"Taken for replacement"** (Windsor wheelchair) is imported as *out of service* with that reason.
18. **Re-import** of the same sheet updates inventory fields only. It never overwrites floor assignments, serials entered in the field, or inspection history.

## Demo data
19. The two photographed paper forms are entered as demo inspections at NKP Mumbai, 10th Floor, under inspector Ashish Dalal:
    - The wheelchair (#3 Fail, "puncher" → puncture) is submitted, which puts it out of service.
    - The three scoop stretchers (all Pass) are finalised by the reviewer.
    - The signature images on these records are generated placeholders.

## Access
20. **One shared access code, no personal logins** (client decision). Anyone with the code has full access, including review and finalising. After entering it, each device asks who is using it; that name goes on signatures and in the audit trail. The remembered signature is stored per person on that device. The code defaults to `9999` and is changed with `ACCESS_CODE`. A 4-digit code is easy to guess, so use a longer one if the address is shared widely. The earlier role separation (inspector / reviewer / client admin) is no longer enforced, because everyone shares one account.
